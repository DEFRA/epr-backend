import { writeToString } from '@fast-csv/format'
import { Readable } from 'node:stream'

import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { resolveAccreditation } from '#domain/organisations/registration-utils.js'
import {
  buildHeaderRow,
  buildDataRow,
  buildDataFieldColumns
} from '../domain/csv-columns.js'
import { isIncludedInWasteBalance } from '../domain/is-included-in-waste-balance.js'
import { buildOverseasSitesContext } from '../domain/overseas-sites-context.js'
import { loadSummaryLogMap } from './load-summary-log-map.js'

const TEST_ORGANISATIONS = new Set(TEST_ORGANISATION_IDS)

/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {WasteRecord, WasteRecordVersion} from '#domain/waste-records/model.js' */
/** @import {OverseasSite} from '#overseas-sites/repository/port.js' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */
/** @import {WasteRecordsRepository} from '#repositories/waste-records/port.js' */
/** @import {SummaryLogsRepository} from '#repositories/summary-logs/port.js' */
/** @import {OverseasSitesRepository} from '#overseas-sites/repository/port.js' */

/**
 * @typedef {Object} StreamCsvExportDeps
 * @property {Pick<OrganisationsRepository, 'findAll'>} organisationsRepository
 * @property {Pick<WasteRecordsRepository, 'findByRegistration' | 'findDistinctDataKeys'>} wasteRecordsRepository
 * @property {Pick<SummaryLogsRepository, 'findAllByOrgReg'>} summaryLogsRepository
 * @property {Pick<OverseasSitesRepository, 'findAll'>} overseasSitesRepository
 */

const sortById = (a, b) => a.id.localeCompare(b.id)

const sortRecords = (a, b) => {
  const t = a.type.localeCompare(b.type)
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
 * Build one CSV data row for a record under a given (org, registration) pair.
 *
 * @param {Object} input
 * @param {Organisation} input.org
 * @param {Registration} input.registration
 * @param {import('#domain/organisations/accreditation.js').Accreditation | null} input.accreditation
 * @param {Record<string, { validFrom: Date | null }>} input.overseasSites
 * @param {Map<string, { submittedAt: string }>} input.summaryLogMap
 * @param {WasteRecord} input.record
 * @param {string[]} input.dataFieldColumns
 * @returns {(string | number)[]}
 */
const rowForRecord = ({
  org,
  registration,
  accreditation,
  overseasSites,
  summaryLogMap,
  record,
  dataFieldColumns
}) => {
  // `record.versions` is a non-empty array per the WasteRecord schema, so
  // `.at(-1)` is always defined here. The cast tells tsc to drop the
  // `| undefined` from the .at() return type rather than adding a guard
  // for a state that cannot occur.
  const lastVersion = /** @type {WasteRecordVersion} */ (record.versions.at(-1))
  const summaryLogEntry = summaryLogMap.get(lastVersion.summaryLog.id) ?? null
  const includedInWasteBalance = isIncludedInWasteBalance(
    record,
    accreditation,
    overseasSites
  )
  return buildDataRow({
    org,
    registration,
    accreditation,
    record,
    summaryLogEntry,
    includedInWasteBalance,
    dataFieldColumns
  })
}

/**
 * Yield one CSV row per waste record under a single (org, registration) pair.
 * Records for the pair are fetched into memory together (bounded by the count
 * per registration, not the whole system) and yielded one row at a time.
 *
 * @param {Object} input
 * @param {Organisation} input.org
 * @param {Registration} input.registration
 * @param {Map<string, OverseasSite>} input.sitesById
 * @param {string[]} input.dataFieldColumns
 * @param {Pick<WasteRecordsRepository, 'findByRegistration'>} input.wasteRecordsRepository
 * @param {Pick<SummaryLogsRepository, 'findAllByOrgReg'>} input.summaryLogsRepository
 * @returns {AsyncGenerator<string>}
 */
async function* streamRegistrationRows({
  org,
  registration,
  sitesById,
  dataFieldColumns,
  wasteRecordsRepository,
  summaryLogsRepository
}) {
  const accreditation = resolveAccreditation(registration, org)
  const overseasSites = buildOverseasSitesContext(registration, sitesById)
  const summaryLogMap = await loadSummaryLogMap(
    summaryLogsRepository,
    org.id,
    registration.id
  )

  const records = await wasteRecordsRepository.findByRegistration(
    org.id,
    registration.id
  )
  const recordsSorted = [...records].sort(sortRecords)

  for (const record of recordsSorted) {
    yield await encodeRow(
      rowForRecord({
        org,
        registration,
        accreditation,
        overseasSites,
        summaryLogMap,
        record,
        dataFieldColumns
      })
    )
  }
}

/**
 * Yields CSV-encoded lines (header first, then one per waste record).
 * Hard-fails on any iterator error — caller must close the response stream.
 *
 * The header row is dynamically composed from the union of schema-declared
 * field constants and any keys observed on actual `record.data` objects.
 * Observed keys are discovered up-front via a server-side aggregation
 * (`findDistinctDataKeys`) so the export does not need to materialise any
 * waste-record document to compose the header. Rows are then streamed one
 * registration at a time — memory is bounded by the largest single
 * registration's record count, not the total record count in the system.
 *
 * @param {StreamCsvExportDeps} deps
 * @returns {AsyncGenerator<string>}
 */
export async function* streamCsvExport(deps) {
  const {
    organisationsRepository,
    wasteRecordsRepository,
    summaryLogsRepository,
    overseasSitesRepository
  } = deps

  const [allSites, orgs, observedKeys] = await Promise.all([
    overseasSitesRepository.findAll(),
    organisationsRepository.findAll(),
    wasteRecordsRepository.findDistinctDataKeys()
  ])

  const sitesById = new Map(allSites.map((s) => [s.id, s]))
  const dataFieldColumns = buildDataFieldColumns(observedKeys)
  yield await encodeRow(buildHeaderRow(dataFieldColumns))

  const orgsSorted = orgs
    .filter((org) => !TEST_ORGANISATIONS.has(org.orgId))
    .sort(sortById)
  for (const org of orgsSorted) {
    const registrations = [...(org.registrations ?? [])].sort(sortById)
    for (const registration of registrations) {
      yield* streamRegistrationRows({
        org,
        registration,
        sitesById,
        dataFieldColumns,
        wasteRecordsRepository,
        summaryLogsRepository
      })
    }
  }
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
