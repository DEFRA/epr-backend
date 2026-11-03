import { writeToString } from '@fast-csv/format'
import { Readable } from 'node:stream'

import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import {
  readModelAccreditedPeriod,
  readModelOverseasSitesContext
} from '#waste-balances/domain/classification-context.js'
import {
  accreditationKey,
  indexReadModelAccreditations
} from '#waste-balances/application/accreditation-index.js'
import { HELD_ACCREDITATION_STATUSES } from '#organisation-read-model/domain/model.js'
import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'
import { coerceRowData } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { reclassifyWasteRecordState } from '#waste-records/application/reclassify-waste-record-states.js'
import {
  buildHeaderRow,
  buildDataRow,
  buildDataFieldColumns
} from '../domain/csv-columns.js'
import { loadSummaryLogMap } from './load-summary-log-map.js'

/** @import {Organisation, Registration, ExporterRegistration} from '#organisation-read-model/domain/model.js' */
/** @import {OrganisationNumber, RegistrationNumber} from '#domain/organisations/numbers.js' */
/** @import {OrganisationReadRepository} from '#organisation-read-model/repository/port.js' */
/** @import {AccreditationReadModelContext} from '#waste-balances/application/accreditation-index.js' */
/** @import {SummaryLogRowState} from '#waste-records/repository/schema.js' */
/** @import {WasteRecordState} from '#waste-records/application/read-summary-log-row-states.js' */
/** @import {SummaryLogRowStatesRepository} from '#waste-records/repository/port.js' */
/** @import {WasteBalanceLedgerRepository, LatestSubmittedSummaryLogPerLedger} from '#waste-balances/repository/ledger-port.js' */
/** @import {SummaryLogsRepository} from '#repositories/summary-logs/port.js' */
/** @import {NumberedLedgerId} from '#waste-balances/repository/ledger-schema.js' */
/** @import {ReclassificationContext} from '#waste-records/application/reclassify-waste-record-states.js' */
/** @import {OverseasSitesContext} from '#waste-balances/domain/classification-context.js' */
/** @import {OverseasSiteContextEntry} from '../domain/overseas-sites-context.js' */

/**
 * @typedef {Object} StreamCsvExportDeps
 * @property {Pick<OrganisationReadRepository, 'findAll' | 'findByOrganisationNumber'>} organisationReadRepository
 * @property {Pick<SummaryLogRowStatesRepository, 'findWasteRecordStatesForSummaryLog' | 'findDistinctDataKeys'>} summaryLogRowStatesRepository
 * @property {Pick<WasteBalanceLedgerRepository, 'findLatestSubmittedSummaryLogPerLedger'>} ledgerRepository
 * @property {Pick<SummaryLogsRepository, 'findAll'>} summaryLogsRepository
 * @property {OrganisationNumber} [organisationNumber] - When set, export only this organisation.
 * @property {RegistrationNumber} [registrationNumber] - When set (with organisationNumber), export only this registration.
 */

/** @type {(a: [string, unknown], b: [string, unknown]) => number} */
const compareKeys = ([a], [b]) => a.localeCompare(b)

/**
 * @param {Pick<SummaryLogRowState, 'wasteRecordType' | 'rowId'>} a
 * @param {Pick<SummaryLogRowState, 'wasteRecordType' | 'rowId'>} b
 * @returns {number}
 */
export const sortRowStates = (a, b) => {
  const t = a.wasteRecordType.localeCompare(b.wasteRecordType)
  // `numeric: true` gives natural ordering ('9' before '10') while still
  // working for non-numeric rowIds.
  return (
    t ||
    String(a.rowId).localeCompare(String(b.rowId), undefined, {
      numeric: true
    })
  )
}

/**
 * Surface a row state's stored data in the schema's canonical types — the same
 * read-time coercion the rest of the system applies. A column that arrives
 * mixed-typed from ExcelJS (a number in one submission, a numeric-string in
 * another) is stored as submitted, so coercing on read is what makes the
 * exported column hold a single type across rows. `processingType`, held as a
 * top-level field on the row state, is merged back onto the data both to select
 * the schema and to fill its metadata column.
 *
 * @param {Pick<SummaryLogRowState, 'data' | 'processingType' | 'wasteRecordType'>} rowState
 * @returns {Record<string, any>}
 */
export const coerceForExport = ({ data, processingType, wasteRecordType }) => {
  const withProcessingType = { ...data, processingType }
  const schema = findSchemaForProcessingType(processingType, wasteRecordType)
  return schema
    ? coerceRowData(withProcessingType, schema).data
    : withProcessingType
}

/**
 * Encode a single row of cells into a CSV-formatted line with trailing newline.
 *
 * fast-csv's default selective quoting applies: numbers serialise bare so they
 * stay numeric, while text containing the delimiter, a quote, or a newline is
 * still quoted.
 *
 * @param {ReadonlyArray<string | number>} cells
 * @returns {Promise<string>}
 */
export const encodeRow = async (cells) => {
  const line = await writeToString([[...cells]], { headers: false })
  return `${line}\n`
}

// Deterministic partition order within a registration: registered-only
// (null accreditation) first, then accreditation numbers ascending.
const sortEntriesByAccreditationNumber = (a, b) =>
  String(a.ledgerId.accreditationNumber ?? '').localeCompare(
    String(b.ledgerId.accreditationNumber ?? '')
  )

/**
 * The export answers a question about the present, so it discards the reading
 * stamped at submission and recomputes against the accreditation and overseas
 * sites as they stand at export time.
 *
 * @param {WasteRecordState} rowState
 * @param {ReclassificationContext} context
 * @returns {WasteRecordState['classification']}
 */
const recomputedClassification = (rowState, context) =>
  reclassifyWasteRecordState(rowState, context).classification

/**
 * Every site the registration names, for the OSR_NAME_REVISED and
 * OSR_COUNTRY_REVISED columns. A row shows its site's name and country
 * whether or not an accreditation vouches for it; only classification reads
 * the accreditation's approvals.
 *
 * @param {Registration} registration
 * @returns {Record<string, OverseasSiteContextEntry>}
 */
const registeredSites = (registration) =>
  Object.fromEntries(
    Object.entries(
      /** @type {ExporterRegistration} */ (registration).overseasSites ?? {}
    ).map(([osr, site]) => [
      osr,
      { approvedFrom: null, name: site.name, country: site.address.country }
    ])
  )

/**
 * The accreditation a partition is classified and displayed against: the one
 * its numbers name, as it stands at export time, and only while it is held
 * (approved or suspended). A partition whose accreditation is registered-only,
 * no longer held or absent from the read model is not accredited, but its rows
 * are still exported.
 *
 * @param {Map<string, AccreditationReadModelContext>} accreditationIndex
 * @param {NumberedLedgerId} ledgerId
 * @returns {AccreditationReadModelContext | null}
 */
const heldAccreditationOf = (accreditationIndex, ledgerId) => {
  if (ledgerId.accreditationNumber === null) {
    return null
  }
  const found = accreditationIndex.get(
    accreditationKey({
      ...ledgerId,
      accreditationNumber: ledgerId.accreditationNumber
    })
  )
  return found &&
    HELD_ACCREDITATION_STATUSES.has(found.accreditation.status.current)
    ? found
    : null
}

/**
 * Yield one CSV row per row state of a single ledger partition, ordered by
 * `(wasteRecordType, rowId)`.
 *
 * @param {Object} input
 * @param {Organisation} input.org
 * @param {Registration} input.registration
 * @param {RegistrationNumber} input.registrationNumber
 * @param {AccreditationReadModelContext | null} input.accreditation
 * @param {WasteRecordState[]} input.rowStates
 * @param {{ submittedAt: string } | null} input.summaryLogEntry
 * @param {string[]} input.dataFieldColumns
 * @returns {AsyncGenerator<string>}
 */
async function* streamPartitionRows({
  org,
  registration,
  registrationNumber,
  accreditation,
  rowStates,
  summaryLogEntry,
  dataFieldColumns
}) {
  // The Accredited columns read the partition's own accreditation, held as of
  // export time — not the registration's current one. A registered-only
  // period renders as not accredited, and registered-only rows are not
  // applicable whatever the registration's sites, so they classify against
  // none.
  /** @type {Exclude<OverseasSitesContext, symbol>} */
  const classificationSites = accreditation
    ? /** @type {Exclude<OverseasSitesContext, symbol>} */ (
        readModelOverseasSitesContext(registration, accreditation.accreditation)
      )
    : {}
  const accreditedPeriod = accreditation
    ? readModelAccreditedPeriod(accreditation.accreditation, accreditation.year)
    : null
  const overseasSites = {
    ...registeredSites(registration),
    ...classificationSites
  }

  for (const rowState of [...rowStates].sort(sortRowStates)) {
    yield await encodeRow(
      buildDataRow({
        org,
        registration,
        registrationNumber,
        accreditation: accreditation?.accreditation ?? null,
        data: coerceForExport(rowState),
        wasteRecordType: rowState.wasteRecordType,
        rowId: rowState.rowId,
        classification: recomputedClassification(rowState, {
          accreditation: accreditedPeriod,
          overseasSites: classificationSites
        }),
        summaryLogEntry,
        overseasSites,
        dataFieldColumns
      })
    )
  }
}

/**
 * @typedef {Object} RegistrationRowsContext
 * @property {Organisation} org
 * @property {Registration} registration
 * @property {RegistrationNumber} registrationNumber
 * @property {Map<string, AccreditationReadModelContext>} accreditationIndex
 * @property {Map<string, { submittedAt: string }>} summaryLogMap
 * @property {string[]} dataFieldColumns
 */

/**
 * The registration's rows as of now: the membership of the latest submitted
 * summary log of every ledger partition it has written to, each partition's
 * rows fetched in turn.
 *
 * @param {Omit<RegistrationRowsContext, 'accreditationIndex'> & {
 *   accreditationIndex: Map<string, AccreditationReadModelContext>,
 *   entries: LatestSubmittedSummaryLogPerLedger[],
 *   summaryLogRowStatesRepository: Pick<SummaryLogRowStatesRepository, 'findWasteRecordStatesForSummaryLog'>
 * }} input
 * @returns {AsyncGenerator<string>}
 */
async function* streamLatestSubmissionRows({
  entries,
  summaryLogRowStatesRepository,
  summaryLogMap,
  accreditationIndex,
  ...context
}) {
  for (const { ledgerId, summaryLogId } of [...entries].sort(
    sortEntriesByAccreditationNumber
  )) {
    yield* streamPartitionRows({
      ...context,
      accreditation: heldAccreditationOf(accreditationIndex, ledgerId),
      rowStates:
        await summaryLogRowStatesRepository.findWasteRecordStatesForSummaryLog(
          ledgerId,
          summaryLogId
        ),
      summaryLogEntry: summaryLogMap.get(summaryLogId) ?? null
    })
  }
}

/**
 * Yield one CSV row per row state of a single (org, registration) pair — each
 * ledger partition's latest submission. A partition is one accreditation the
 * registration has been linked to, plus a null-accreditation partition for
 * registered-only periods (PAE-1773); its submission timestamp is the
 * "Submitted At" column shared by its rows. A registration with no submitted
 * summary log contributes no rows.
 *
 * @param {Object} input
 * @param {Organisation} input.org
 * @param {Registration} input.registration
 * @param {RegistrationNumber} input.registrationNumber
 * @param {LatestSubmittedSummaryLogPerLedger[]} input.entries - The registration's per-partition latest submissions.
 * @param {Map<string, AccreditationReadModelContext>} input.accreditationIndex
 * @param {string[]} input.dataFieldColumns
 * @param {Pick<SummaryLogRowStatesRepository, 'findWasteRecordStatesForSummaryLog'>} input.summaryLogRowStatesRepository
 * @param {Pick<SummaryLogsRepository, 'findAll'>} input.summaryLogsRepository
 * @returns {AsyncGenerator<string>}
 */
async function* streamRegistrationRows({
  org,
  registration,
  registrationNumber,
  entries,
  accreditationIndex,
  dataFieldColumns,
  summaryLogRowStatesRepository,
  summaryLogsRepository
}) {
  if (entries.length === 0) {
    return
  }

  yield* streamLatestSubmissionRows({
    org,
    registration,
    registrationNumber,
    accreditationIndex,
    dataFieldColumns,
    summaryLogMap: await loadSummaryLogMap(
      summaryLogsRepository,
      org.organisationNumber,
      registrationNumber
    ),
    entries,
    summaryLogRowStatesRepository
  })
}

/**
 * Yields CSV-encoded lines (header first, then one per row state).
 * Hard-fails on any iterator error — caller must close the response stream.
 *
 * The header row is dynamically composed from the union of schema-declared
 * field constants and any keys observed on stored row-state `data` objects.
 * Observed keys are discovered up-front via a server-side aggregation
 * (`findDistinctDataKeys`) so the export does not need to materialise any row
 * state to compose the header. Each registration's ledger partitions are
 * resolved up-front from a single cross-ledger query
 * (`findLatestSubmittedSummaryLogPerLedger`), then rows are streamed one
 * partition at a time — memory is bounded by the largest single partition's
 * row count, not the total across the system.
 *
 * @param {StreamCsvExportDeps} deps
 * @returns {AsyncGenerator<string>}
 */
export async function* streamCsvExport(deps) {
  const {
    organisationReadRepository,
    summaryLogRowStatesRepository,
    ledgerRepository,
    summaryLogsRepository,
    organisationNumber,
    registrationNumber
  } = deps

  const [observedKeys, latestSubmittedEntries] = await Promise.all([
    summaryLogRowStatesRepository.findDistinctDataKeys(),
    ledgerRepository.findLatestSubmittedSummaryLogPerLedger()
  ])

  const dataFieldColumns = buildDataFieldColumns(observedKeys)
  yield await encodeRow(buildHeaderRow(dataFieldColumns))

  const entriesByRegistration = groupByRegistration(latestSubmittedEntries)

  const orgsSorted = organisationNumber
    ? await findScopedOrg(organisationReadRepository, organisationNumber)
    : await findExportableOrgs(organisationReadRepository)
  // Test organisations are already dropped (or asked for by number), so the
  // index takes every organisation it is given.
  const { index: accreditationIndex } = indexReadModelAccreditations(
    orgsSorted,
    { includeTestOrganisations: true }
  )
  for (const org of orgsSorted) {
    const registrations = Object.entries(org.registrations)
      .filter(
        ([number]) => !registrationNumber || number === registrationNumber
      )
      .sort(compareKeys)
    for (const [number, registration] of registrations) {
      const registrationNumberOfOrg = /** @type {RegistrationNumber} */ (number)
      yield* streamRegistrationRows({
        org,
        registration,
        registrationNumber: registrationNumberOfOrg,
        entries:
          entriesByRegistration.get(
            registrationKey(org.organisationNumber, registrationNumberOfOrg)
          ) ?? [],
        accreditationIndex,
        dataFieldColumns,
        summaryLogRowStatesRepository,
        summaryLogsRepository
      })
    }
  }
}

/**
 * @param {string} organisationNumber
 * @param {string} registrationNumber
 * @returns {string}
 */
const registrationKey = (organisationNumber, registrationNumber) =>
  `${organisationNumber}/${registrationNumber}`

/**
 * Group the per-partition latest-submission entries by owning
 * (organisation, registration) pair, so the per-registration streaming loop
 * can pick up every ledger partition a registration has written to.
 *
 * @param {LatestSubmittedSummaryLogPerLedger[]} entries
 * @returns {Map<string, LatestSubmittedSummaryLogPerLedger[]>}
 */
const groupByRegistration = (entries) => {
  /** @type {Map<string, LatestSubmittedSummaryLogPerLedger[]>} */
  const grouped = new Map()
  for (const entry of entries) {
    const key = registrationKey(
      entry.ledgerId.organisationNumber,
      entry.ledgerId.registrationNumber
    )
    const list = grouped.get(key)
    if (list) {
      list.push(entry)
    } else {
      grouped.set(key, [entry])
    }
  }
  return grouped
}

const byOrganisationNumber = (a, b) =>
  a.organisationNumber.localeCompare(b.organisationNumber)

/**
 * Every non-test organisation, sorted by number for deterministic output.
 *
 * @param {Pick<OrganisationReadRepository, 'findAll'>} organisationReadRepository
 * @returns {Promise<Organisation[]>}
 */
async function findExportableOrgs(organisationReadRepository) {
  const orgs = await organisationReadRepository.findAll()
  return orgs
    .filter((org) => !TEST_ORGANISATION_IDS.has(Number(org.organisationNumber)))
    .sort(byOrganisationNumber)
}

/**
 * The one organisation an export is scoped to — test organisations included,
 * since it was asked for by number.
 *
 * @param {Pick<OrganisationReadRepository, 'findByOrganisationNumber'>} organisationReadRepository
 * @param {OrganisationNumber} organisationNumber
 * @returns {Promise<Organisation[]>}
 */
async function findScopedOrg(organisationReadRepository, organisationNumber) {
  const org =
    await organisationReadRepository.findByOrganisationNumber(
      organisationNumber
    )
  return org ? [org] : []
}

/**
 * Convenience: turn the generator into a Node Readable stream so a Hapi
 * route handler can return it directly.
 *
 * Using `objectMode: false` ensures Hapi treats each yielded string as
 * an HTTP body chunk (rather than as a JavaScript value), which is what
 * `Readable.from` would default to.
 *
 * @param {StreamCsvExportDeps} deps
 * @returns {Readable}
 */
export const streamCsvExportToReadable = (deps) =>
  Readable.from(streamCsvExport(deps), { objectMode: false })
