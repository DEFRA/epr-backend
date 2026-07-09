import { writeToString } from '@fast-csv/format'
import { Readable } from 'node:stream'

import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { resolveAccreditation } from '#domain/organisations/registration-utils.js'
import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'
import { coerceRowData } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { latestSubmittedSummaryLogId } from '#waste-balances/application/latest-submitted-summary-log-id.js'
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
/** @import {WasteBalanceLedgerRepository} from '#waste-balances/repository/ledger-port.js' */
/** @import {SummaryLogsRepository} from '#repositories/summary-logs/port.js' */
/** @import {OverseasSitesRepository} from '#overseas-sites/repository/port.js' */

/**
 * @typedef {Object} StreamCsvExportDeps
 * @property {Pick<OrganisationsRepository, 'findAll' | 'findById'>} organisationsRepository
 * @property {Pick<SummaryLogRowStateRepository, 'findRowStatesForSummaryLog' | 'findDistinctDataKeys'>} summaryLogRowStatesRepository
 * @property {WasteBalanceLedgerRepository} ledgerRepository
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
 * @param {SummaryLogRowState} rowState
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

/**
 * Yield one CSV row per row state of a single (org, registration) pair. The
 * registration's current rows are the membership of its latest submitted
 * summary log, resolved once from the waste balance ledger; that submission's
 * timestamp is the "Submitted At" column shared by every row. A registration
 * with no submitted summary log contributes no rows.
 *
 * @param {Object} input
 * @param {Organisation} input.org
 * @param {Registration} input.registration
 * @param {Map<string, OverseasSite>} input.sitesById
 * @param {string[]} input.dataFieldColumns
 * @param {Pick<SummaryLogRowStateRepository, 'findRowStatesForSummaryLog'>} input.summaryLogRowStatesRepository
 * @param {WasteBalanceLedgerRepository} input.ledgerRepository
 * @param {Pick<SummaryLogsRepository, 'findAllByOrgReg'>} input.summaryLogsRepository
 * @returns {AsyncGenerator<string>}
 */
async function* streamRegistrationRows({
  org,
  registration,
  sitesById,
  dataFieldColumns,
  summaryLogRowStatesRepository,
  ledgerRepository,
  summaryLogsRepository
}) {
  const accreditation = resolveAccreditation(registration, org)
  const accreditationId = accreditation?.id ?? null
  const overseasSites = buildOverseasSitesContext(registration, sitesById)

  const ledgerId = {
    organisationId: org.id,
    registrationId: registration.id,
    accreditationId
  }

  const latestSummaryLogId = await latestSubmittedSummaryLogId(
    ledgerRepository,
    ledgerId
  )
  if (latestSummaryLogId === null) {
    return
  }

  const rowStates =
    await summaryLogRowStatesRepository.findRowStatesForSummaryLog(
      ledgerId,
      latestSummaryLogId
    )

  const summaryLogMap = await loadSummaryLogMap(
    summaryLogsRepository,
    org.id,
    registration.id
  )
  const summaryLogEntry = summaryLogMap.get(latestSummaryLogId) ?? null

  const rowStatesSorted = [...rowStates].sort(sortRowStates)

  for (const rowState of rowStatesSorted) {
    yield await encodeRow(
      buildDataRow({
        org,
        registration,
        accreditation,
        data: coerceForExport(rowState),
        wasteRecordType: rowState.wasteRecordType,
        rowId: rowState.rowId,
        classification: rowState.classification,
        summaryLogEntry,
        overseasSites,
        dataFieldColumns
      })
    )
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
 * state to compose the header. Rows are then streamed one registration at a
 * time — memory is bounded by the largest single registration's row count, not
 * the total across the system.
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

  const [allSites, observedKeys] = await Promise.all([
    overseasSitesRepository.findAll(),
    summaryLogRowStatesRepository.findDistinctDataKeys()
  ])

  const sitesById = new Map(allSites.map((s) => [s.id, s]))
  const dataFieldColumns = buildDataFieldColumns(observedKeys)
  yield await encodeRow(buildHeaderRow(dataFieldColumns))

  const orgsSorted = await resolveOrgs(organisationsRepository, organisationId)
  for (const org of orgsSorted) {
    const registrations = [...(org.registrations ?? [])]
      .filter((reg) => !registrationId || reg.id === registrationId)
      .sort(sortById)
    for (const registration of registrations) {
      yield* streamRegistrationRows({
        org,
        registration,
        sitesById,
        dataFieldColumns,
        summaryLogRowStatesRepository,
        ledgerRepository,
        summaryLogsRepository
      })
    }
  }
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
