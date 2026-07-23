import { writeToString } from '@fast-csv/format'
import { Readable } from 'node:stream'

import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { resolveAccreditation } from '#domain/organisations/registration-utils.js'
import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'
import { coerceRowData } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { toWasteRecordState } from '#waste-records/application/read-summary-log-row-states.js'
import { reclassifyWasteRecordState } from '#waste-records/application/reclassify-waste-record-states.js'
import {
  buildHeaderRow,
  buildDataRow,
  buildDataFieldColumns
} from '../domain/csv-columns.js'
import { buildOverseasSitesContext } from '../domain/overseas-sites-context.js'
import { loadSummaryLogMap } from './load-summary-log-map.js'

const TEST_ORGANISATIONS = new Set(TEST_ORGANISATION_IDS)

/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {SummaryLogRowState} from '#waste-records/repository/schema.js' */
/** @import {OverseasSite} from '#overseas-sites/repository/port.js' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */
/** @import {SummaryLogRowStateRepository} from '#waste-records/repository/port.js' */
/** @import {WasteBalanceLedgerRepository, LatestSubmittedSummaryLogPerLedger} from '#waste-balances/repository/ledger-port.js' */
/** @import {SummaryLogsRepository} from '#repositories/summary-logs/port.js' */
/** @import {OverseasSitesRepository} from '#overseas-sites/repository/port.js' */

/**
 * @typedef {Object} StreamCsvExportDeps
 * @property {Pick<OrganisationsRepository, 'findAll' | 'findById'>} organisationsRepository
 * @property {Pick<SummaryLogRowStateRepository, 'findRowStatesForSummaryLog' | 'findDistinctDataKeys'>} summaryLogRowStatesRepository
 * @property {Pick<WasteBalanceLedgerRepository, 'findLatestSubmittedSummaryLogPerLedger'>} ledgerRepository
 * @property {Pick<SummaryLogsRepository, 'findAllByOrgReg'>} summaryLogsRepository
 * @property {Pick<OverseasSitesRepository, 'findAll'>} overseasSitesRepository
 * @property {string} [organisationId] - When set, export only this organisation.
 * @property {string} [registrationId] - When set (with organisationId), export only this registration.
 */

const sortById = (a, b) => a.id.localeCompare(b.id)

const sortRowStates = (a, b) => {
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
const coerceForExport = ({ data, processingType, wasteRecordType }) => {
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
const encodeRow = async (cells) => {
  const line = await writeToString([[...cells]], { headers: false })
  return `${line}\n`
}

// Deterministic partition order within a registration: registered-only
// (null accreditation) first, then accreditation ids ascending.
const sortEntriesByAccreditationId = (a, b) =>
  String(a.ledgerId.accreditationId ?? '').localeCompare(
    String(b.ledgerId.accreditationId ?? '')
  )

/**
 * Yield one CSV row per row state of a single (org, registration) pair. A
 * registration's rows are the membership of the latest submitted summary log
 * of every ledger partition it has written to — one partition per
 * accreditation it has been linked to, plus a null-accreditation partition for
 * registered-only periods (PAE-1773). Each partition's submission timestamp is
 * the "Submitted At" column shared by its rows. A registration with no
 * submitted summary log contributes no rows.
 *
 * @param {Object} input
 * @param {Organisation} input.org
 * @param {Registration} input.registration
 * @param {LatestSubmittedSummaryLogPerLedger[]} input.entries - The registration's per-partition latest submissions.
 * @param {Map<string, OverseasSite>} input.sitesById
 * @param {string[]} input.dataFieldColumns
 * @param {Pick<SummaryLogRowStateRepository, 'findRowStatesForSummaryLog'>} input.summaryLogRowStatesRepository
 * @param {Pick<SummaryLogsRepository, 'findAllByOrgReg'>} input.summaryLogsRepository
 * @returns {AsyncGenerator<string>}
 */
async function* streamRegistrationRows({
  org,
  registration,
  entries,
  sitesById,
  dataFieldColumns,
  summaryLogRowStatesRepository,
  summaryLogsRepository
}) {
  if (entries.length === 0) {
    return
  }

  const overseasSites = buildOverseasSitesContext(registration, sitesById)
  const summaryLogMap = await loadSummaryLogMap(
    summaryLogsRepository,
    org.id,
    registration.id
  )

  const entriesSorted = [...entries].sort(sortEntriesByAccreditationId)

  for (const { ledgerId, summaryLogId } of entriesSorted) {
    // The Accredited columns and the reclassification read the partition's own
    // accreditation, resolved active-only (approved/suspended) as of export
    // time — not the registration's current link. Rows submitted under a
    // since-cancelled accreditation or a registered-only period render as not
    // accredited but are still exported.
    const accreditation = resolveAccreditation(
      { accreditationId: ledgerId.accreditationId },
      org
    )

    const rowStates =
      await summaryLogRowStatesRepository.findRowStatesForSummaryLog(
        ledgerId,
        summaryLogId
      )
    if (rowStates.length === 0) {
      continue
    }

    const summaryLogEntry = summaryLogMap.get(summaryLogId) ?? null

    const rowStatesSorted = [...rowStates].sort(sortRowStates)

    for (const rowState of rowStatesSorted) {
      // The waste-balance columns answer as of the same moment as the
      // Accredited and OSR columns beside them, which read the accreditation
      // and the registration's overseas sites as they stand at export time.
      const { classification } = reclassifyWasteRecordState(
        toWasteRecordState(rowState),
        { accreditation, overseasSites }
      )

      yield await encodeRow(
        buildDataRow({
          org,
          registration,
          accreditation,
          data: coerceForExport(rowState),
          wasteRecordType: rowState.wasteRecordType,
          rowId: rowState.rowId,
          classification,
          summaryLogEntry,
          overseasSites,
          dataFieldColumns
        })
      )
    }
  }
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
    organisationsRepository,
    summaryLogRowStatesRepository,
    ledgerRepository,
    summaryLogsRepository,
    overseasSitesRepository,
    organisationId,
    registrationId
  } = deps

  const [allSites, observedKeys, latestSubmittedEntries] = await Promise.all([
    overseasSitesRepository.findAll(),
    summaryLogRowStatesRepository.findDistinctDataKeys(),
    ledgerRepository.findLatestSubmittedSummaryLogPerLedger()
  ])

  const sitesById = new Map(allSites.map((s) => [s.id, s]))
  const dataFieldColumns = buildDataFieldColumns(observedKeys)
  yield await encodeRow(buildHeaderRow(dataFieldColumns))

  const entriesByRegistration = groupByRegistration(latestSubmittedEntries)

  const orgsSorted = await resolveOrgs(organisationsRepository, organisationId)
  for (const org of orgsSorted) {
    const registrations = [...(org.registrations ?? [])]
      .filter((reg) => !registrationId || reg.id === registrationId)
      .sort(sortById)
    for (const registration of registrations) {
      yield* streamRegistrationRows({
        org,
        registration,
        entries:
          entriesByRegistration.get(registrationKey(org.id, registration.id)) ??
          [],
        sitesById,
        dataFieldColumns,
        summaryLogRowStatesRepository,
        summaryLogsRepository
      })
    }
  }
}

/**
 * @param {string} organisationId
 * @param {string} registrationId
 * @returns {string}
 */
const registrationKey = (organisationId, registrationId) =>
  `${organisationId}::${registrationId}`

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
      entry.ledgerId.organisationId,
      entry.ledgerId.registrationId
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
 * Resolve the organisations to export, sorted by id for deterministic output.
 *
 * When an id is given the single organisation is fetched directly (and the
 * test-organisation exclusion is bypassed — an explicit request wins). The
 * unscoped path lists every organisation and drops the test ones.
 *
 * @param {Pick<OrganisationsRepository, 'findAll' | 'findById'>} organisationsRepository
 * @param {string} [organisationId]
 * @returns {Promise<Organisation[]>}
 */
async function resolveOrgs(organisationsRepository, organisationId) {
  if (organisationId) {
    return [await organisationsRepository.findById(organisationId)]
  }

  const orgs = await organisationsRepository.findAll()
  return orgs.filter((org) => !TEST_ORGANISATIONS.has(org.orgId)).sort(sortById)
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
