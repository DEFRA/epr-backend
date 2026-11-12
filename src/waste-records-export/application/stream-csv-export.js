import { writeToString } from '@fast-csv/format'
import { Readable } from 'node:stream'

import { TEST_ORGANISATION_NUMBERS } from '#common/helpers/parse-test-organisations.js'
import { toRegistrationNumber } from '#domain/organisations/numbers.js'
import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'
import { coerceRowData } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { HELD_ACCREDITATION_STATUSES } from '#organisation-read-model/domain/model.js'
import { ledgerKey } from '#waste-balances/application/accreditation-index.js'
import {
  indexByLedger,
  overseasSitesOf,
  validityOf
} from '#waste-balances/application/read-model-accreditations.js'
import { reclassifyWasteRecordState } from '#waste-records/application/reclassify-waste-record-states.js'
import {
  buildHeaderRow,
  buildDataRow,
  buildDataFieldColumns
} from '../domain/csv-columns.js'
import { loadSummaryLogMap } from './load-summary-log-map.js'

/** @import {AccreditationNumber, RegistrationNumber} from '#domain/organisations/numbers.js' */
/** @import {Organisation, Registration} from '#organisation-read-model/domain/model.js' */
/** @import {OrganisationReadRepository} from '#organisation-read-model/repository/port.js' */
/** @import {SummaryLogRowState} from '#waste-records/repository/schema.js' */
/** @import {WasteRecordState} from '#waste-records/application/read-summary-log-row-states.js' */
/** @import {SummaryLogRowStatesRepository} from '#waste-records/repository/port.js' */
/** @import {WasteBalanceLedgerRepository, LatestSubmittedSummaryLogPerLedger} from '#waste-balances/repository/ledger-port.js' */
/** @import {SummaryLogsRepository} from '#repositories/summary-logs/port.js' */
/** @import {WasteBalanceLedgerId} from '#waste-balances/repository/ledger-schema.js' */
/** @import {ReclassificationContext} from '#waste-records/application/reclassify-waste-record-states.js' */
/** @import {LedgerAccreditation} from '#waste-balances/application/read-model-accreditations.js' */

/**
 * @typedef {Object} StreamCsvExportDeps
 * @property {Pick<OrganisationReadRepository, 'findAll'>} organisationReadRepository
 * @property {Pick<SummaryLogRowStatesRepository, 'findWasteRecordStatesForSummaryLog' | 'findDistinctDataKeys'>} summaryLogRowStatesRepository
 * @property {Pick<WasteBalanceLedgerRepository, 'findLatestSubmittedSummaryLogPerLedger'>} ledgerRepository
 * @property {Pick<SummaryLogsRepository, 'findAll'>} summaryLogsRepository
 * @property {Organisation} [organisation] - When set, export only this organisation.
 * @property {RegistrationNumber} [registrationNumber] - When set (with organisation), export only this registration.
 * @property {boolean} [showYear] - When set, each row names its ledger's year.
 */

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

/**
 * Deterministic partition order within a registration: registered-only
 * (null accreditation) first with its years in order, then accreditation
 * numbers ascending.
 *
 * @param {LatestSubmittedSummaryLogPerLedger} a
 * @param {LatestSubmittedSummaryLogPerLedger} b
 */
const sortEntriesByAccreditationNumberAndYear = (a, b) =>
  String(a.ledgerId.accreditationNumber ?? '').localeCompare(
    String(b.ledgerId.accreditationNumber ?? '')
  ) || a.ledgerId.year - b.ledgerId.year

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

/** @type {ReclassificationContext} */
const NOT_ACCREDITED = { accreditation: null, overseasSites: {} }

/**
 * The partition's own accreditation, held (approved or suspended) as of export
 * time — not the registration's current link. Rows submitted under a
 * since-cancelled accreditation or a registered-only period render as not
 * accredited but are still exported.
 *
 * @param {Map<string, LedgerAccreditation>} ledgerIndex - by `ledgerKey`
 * @param {WasteBalanceLedgerId} ledgerId
 * @returns {{ accreditationNumber: AccreditationNumber | null, context: ReclassificationContext }}
 */
const heldAccreditation = (ledgerIndex, ledgerId) => {
  const ledgerAccreditation = ledgerIndex.get(ledgerKey(ledgerId))
  if (
    !ledgerAccreditation ||
    !HELD_ACCREDITATION_STATUSES.has(
      ledgerAccreditation.accreditation.status.current
    )
  ) {
    return { accreditationNumber: null, context: NOT_ACCREDITED }
  }
  return {
    accreditationNumber: ledgerAccreditation.accreditation.accreditationNumber,
    context: {
      accreditation: validityOf(ledgerAccreditation),
      overseasSites: overseasSitesOf(ledgerAccreditation)
    }
  }
}

/**
 * Yield one CSV row per row state of a single ledger partition, ordered by
 * `(wasteRecordType, rowId)`.
 *
 * @param {Object} input
 * @param {Organisation} input.org
 * @param {RegistrationNumber} input.registrationNumber
 * @param {Registration} input.registration
 * @param {Map<string, LedgerAccreditation>} input.ledgerIndex
 * @param {WasteBalanceLedgerId} input.ledgerId
 * @param {WasteRecordState[]} input.rowStates
 * @param {{ submittedAt: string } | null} input.summaryLogEntry
 * @param {string[]} input.dataFieldColumns
 * @param {boolean} input.showYear
 * @returns {AsyncGenerator<string>}
 */
async function* streamPartitionRows({
  org,
  registrationNumber,
  registration,
  ledgerIndex,
  ledgerId,
  rowStates,
  summaryLogEntry,
  dataFieldColumns,
  showYear
}) {
  const { accreditationNumber, context } = heldAccreditation(
    ledgerIndex,
    ledgerId
  )

  for (const rowState of [...rowStates].sort(sortRowStates)) {
    yield await encodeRow(
      buildDataRow({
        org,
        registrationNumber,
        registration,
        accreditationNumber,
        data: coerceForExport(rowState),
        wasteRecordType: rowState.wasteRecordType,
        rowId: rowState.rowId,
        classification: recomputedClassification(rowState, context),
        summaryLogEntry,
        year: ledgerId.year,
        showYear,
        dataFieldColumns
      })
    )
  }
}

/**
 * @typedef {Object} RegistrationRowsContext
 * @property {Organisation} org
 * @property {RegistrationNumber} registrationNumber
 * @property {Registration} registration
 * @property {Map<string, LedgerAccreditation>} ledgerIndex
 * @property {Map<string, { submittedAt: string }>} summaryLogMap
 * @property {string[]} dataFieldColumns
 * @property {boolean} showYear
 */

/**
 * The registration's rows as of now: the membership of the latest submitted
 * summary log of every ledger partition it has written to, each partition's
 * rows fetched in turn.
 *
 * @param {RegistrationRowsContext & {
 *   entries: LatestSubmittedSummaryLogPerLedger[],
 *   summaryLogRowStatesRepository: Pick<SummaryLogRowStatesRepository, 'findWasteRecordStatesForSummaryLog'>
 * }} input
 * @returns {AsyncGenerator<string>}
 */
async function* streamLatestSubmissionRows({
  entries,
  summaryLogRowStatesRepository,
  summaryLogMap,
  ...context
}) {
  for (const { ledgerId, summaryLogId } of [...entries].sort(
    sortEntriesByAccreditationNumberAndYear
  )) {
    yield* streamPartitionRows({
      ...context,
      ledgerId,
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
 * @param {RegistrationNumber} input.registrationNumber
 * @param {Registration} input.registration
 * @param {Map<string, LedgerAccreditation>} input.ledgerIndex
 * @param {LatestSubmittedSummaryLogPerLedger[]} input.entries - The registration's per-partition latest submissions.
 * @param {string[]} input.dataFieldColumns
 * @param {boolean} input.showYear
 * @param {Pick<SummaryLogRowStatesRepository, 'findWasteRecordStatesForSummaryLog'>} input.summaryLogRowStatesRepository
 * @param {Pick<SummaryLogsRepository, 'findAll'>} input.summaryLogsRepository
 * @returns {AsyncGenerator<string>}
 */
async function* streamRegistrationRows({
  org,
  registrationNumber,
  registration,
  ledgerIndex,
  entries,
  dataFieldColumns,
  showYear,
  summaryLogRowStatesRepository,
  summaryLogsRepository
}) {
  if (entries.length === 0) {
    return
  }

  yield* streamLatestSubmissionRows({
    org,
    registrationNumber,
    registration,
    ledgerIndex,
    dataFieldColumns,
    showYear,
    summaryLogMap: await loadSummaryLogMap(summaryLogsRepository, org, {
      registrationNumber
    }),
    entries,
    summaryLogRowStatesRepository
  })
}

/**
 * The organisation's registrations by number, ascending, narrowed to one when
 * `only` is given.
 *
 * @param {Organisation} org
 * @param {RegistrationNumber} [only]
 * @returns {[RegistrationNumber, Registration][]}
 */
const registrationsInOrder = (org, only) =>
  Object.entries(org.registrations)
    .map(
      ([number, registration]) =>
        /** @type {[RegistrationNumber, Registration]} */ ([
          toRegistrationNumber(number),
          registration
        ])
    )
    .filter(([number]) => !only || number === only)
    .sort(([a], [b]) => a.localeCompare(b))

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
    organisation,
    registrationNumber: onlyRegistration,
    showYear = false
  } = deps

  const [observedKeys, latestSubmittedEntries] = await Promise.all([
    summaryLogRowStatesRepository.findDistinctDataKeys(),
    ledgerRepository.findLatestSubmittedSummaryLogPerLedger()
  ])

  const dataFieldColumns = buildDataFieldColumns(observedKeys)
  yield await encodeRow(buildHeaderRow(dataFieldColumns, { showYear }))

  const entriesByRegistration = groupByRegistration(latestSubmittedEntries)

  const orgsSorted = organisation
    ? [organisation]
    : await findExportableOrgs(organisationReadRepository)
  // Test organisations are already left out of a full export.
  const ledgerIndex = indexByLedger(orgsSorted, {
    includeTestOrganisations: true
  })
  for (const org of orgsSorted) {
    for (const [registrationNumber, registration] of registrationsInOrder(
      org,
      onlyRegistration
    )) {
      yield* streamRegistrationRows({
        org,
        registrationNumber,
        registration,
        ledgerIndex,
        entries:
          entriesByRegistration.get(
            registrationKey(org.organisationNumber, registrationNumber)
          ) ?? [],
        dataFieldColumns,
        showYear,
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
  `${organisationNumber}::${registrationNumber}`

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

/**
 * Every non-test organisation, by organisation number.
 *
 * @param {Pick<OrganisationReadRepository, 'findAll'>} organisationReadRepository
 * @returns {Promise<Organisation[]>}
 */
async function findExportableOrgs(organisationReadRepository) {
  const orgs = await organisationReadRepository.findAll()
  return orgs
    .filter(
      ({ organisationNumber }) =>
        !TEST_ORGANISATION_NUMBERS.has(organisationNumber)
    )
    .sort((a, b) => a.organisationNumber.localeCompare(b.organisationNumber))
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
