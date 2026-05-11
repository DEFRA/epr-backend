import { writeToString } from '@fast-csv/format'
import { Readable } from 'node:stream'

import {
  buildHeaderRow,
  buildDataRow,
  buildDataFieldColumns
} from '../domain/csv-columns.js'
import { isIncludedInWasteBalance } from '../domain/is-included-in-waste-balance.js'
import { buildOverseasSitesContext } from '../domain/overseas-sites-context.js'
import { loadSummaryLogMap } from './load-summary-log-map.js'

/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {WasteRecord, WasteRecordVersion} from '#domain/waste-records/model.js' */
/** @import {OverseasSite} from '#overseas-sites/repository/port.js' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */
/** @import {WasteRecordsRepository} from '#repositories/waste-records/port.js' */
/** @import {SummaryLogsRepository} from '#repositories/summary-logs/port.js' */
/** @import {OverseasSitesRepository} from '#overseas-sites/repository/port.js' */

/**
 * @typedef {Object} StreamCsvExportDeps
 * @property {OrganisationsRepository} organisationsRepository
 * @property {WasteRecordsRepository} wasteRecordsRepository
 * @property {SummaryLogsRepository} summaryLogsRepository
 * @property {OverseasSitesRepository} overseasSitesRepository
 */

/**
 * @typedef {Object} BufferedRegistration
 * @property {Organisation} org
 * @property {Registration} registration
 * @property {Accreditation | null} accreditation
 * @property {Record<string, { validFrom: Date | null }>} overseasSites
 * @property {Map<string, { submittedAt: string }>} summaryLogMap
 * @property {WasteRecord[]} records
 */

const sortById = (a, b) => a.id.localeCompare(b.id)

const sortRecords = (a, b) => {
  const t = a.type.localeCompare(b.type)
  return t || String(a.rowId).localeCompare(String(b.rowId))
}

/**
 * Encode a single row of cells into a CSV-formatted line with trailing newline.
 *
 * @param {ReadonlyArray<string> | string[]} cells
 * @returns {Promise<string>}
 */
const encodeRow = async (cells) => {
  const line = await writeToString([[...cells]], {
    headers: false,
    quoteColumns: true
  })
  return `${line}\n`
}

/**
 * Collect the union of data-field keys observed across a list of records,
 * pushing them into a shared Set. Returns the records sorted by type+rowId
 * so the caller can buffer them in the order they will eventually be emitted.
 *
 * @param {WasteRecord[]} records
 * @param {Set<string>} observedKeys
 * @returns {WasteRecord[]}
 */
const collectObservedKeys = (records, observedKeys) => {
  const sorted = [...records].sort(sortRecords)
  for (const record of sorted) {
    for (const key of Object.keys(record.data)) {
      observedKeys.add(key)
    }
  }
  return sorted
}

/**
 * Load all per-registration context (records, summary logs, overseas-site
 * validity, accreditation) into a buffer entry and union its observed keys
 * into the shared `observedKeys` Set so the eventual header row can include
 * any non-schema columns.
 *
 * @param {Object} input
 * @param {Organisation} input.org
 * @param {Registration} input.registration
 * @param {Map<string, OverseasSite>} input.sitesById
 * @param {Set<string>} input.observedKeys
 * @param {WasteRecordsRepository} input.wasteRecordsRepository
 * @param {SummaryLogsRepository} input.summaryLogsRepository
 * @returns {Promise<BufferedRegistration>}
 */
const bufferRegistration = async ({
  org,
  registration,
  sitesById,
  observedKeys,
  wasteRecordsRepository,
  summaryLogsRepository
}) => {
  const accreditation = registration.accreditation ?? null
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
  const recordsSorted = collectObservedKeys(records, observedKeys)

  return {
    org,
    registration,
    accreditation,
    overseasSites,
    summaryLogMap,
    records: recordsSorted
  }
}

/**
 * Walk every (org, registration) pair, buffer each one's data, and return the
 * buffer plus the union of data-field keys observed across all records.
 *
 * @param {Object} input
 * @param {Organisation[]} input.orgs
 * @param {Map<string, OverseasSite>} input.sitesById
 * @param {WasteRecordsRepository} input.wasteRecordsRepository
 * @param {SummaryLogsRepository} input.summaryLogsRepository
 * @returns {Promise<{ buffered: BufferedRegistration[], observedKeys: Set<string> }>}
 */
const bufferAllRegistrations = async ({
  orgs,
  sitesById,
  wasteRecordsRepository,
  summaryLogsRepository
}) => {
  /** @type {BufferedRegistration[]} */
  const buffered = []
  /** @type {Set<string>} */
  const observedKeys = new Set()
  const orgsSorted = [...orgs].sort(sortById)

  for (const org of orgsSorted) {
    const registrations = [...(org.registrations ?? [])].sort(sortById)
    for (const registration of registrations) {
      buffered.push(
        await bufferRegistration({
          org,
          registration,
          sitesById,
          observedKeys,
          wasteRecordsRepository,
          summaryLogsRepository
        })
      )
    }
  }

  return { buffered, observedKeys }
}

/**
 * Build one CSV data row from a buffered registration and one of its records.
 *
 * @param {BufferedRegistration} item
 * @param {WasteRecord} record
 * @param {string[]} dataFieldColumns
 * @returns {string[]}
 */
const rowForRecord = (item, record, dataFieldColumns) => {
  // `record.versions` is a non-empty array per the WasteRecord schema, so
  // `.at(-1)` is always defined here. The cast tells tsc to drop the
  // `| undefined` from the .at() return type rather than adding a guard
  // for a state that cannot occur.
  const lastVersion = /** @type {WasteRecordVersion} */ (record.versions.at(-1))
  const summaryLogEntry =
    item.summaryLogMap.get(lastVersion.summaryLog.id) ?? null
  const includedInWasteBalance = isIncludedInWasteBalance(
    record,
    item.accreditation,
    item.overseasSites
  )
  return buildDataRow({
    org: item.org,
    registration: item.registration,
    record,
    summaryLogEntry,
    includedInWasteBalance,
    dataFieldColumns
  })
}

/**
 * Yields CSV-encoded lines (header first, then one per waste record).
 * Hard-fails on any iterator error — caller must close the response stream.
 *
 * The header row is dynamically composed from the union of schema-declared
 * field constants and any keys observed on actual `record.data` objects.
 * To know all observed keys before emitting the header, the orchestrator
 * loads each registration's records and per-registration context (ORS,
 * summary logs, accreditation) into an in-memory buffer during a single
 * pass, then iterates the buffer to emit rows.
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

  const allSites = await overseasSitesRepository.findAll()
  const sitesById = new Map(allSites.map((s) => [s.id, s]))

  const orgs = await organisationsRepository.findAll()
  const { buffered, observedKeys } = await bufferAllRegistrations({
    orgs,
    sitesById,
    wasteRecordsRepository,
    summaryLogsRepository
  })

  const dataFieldColumns = buildDataFieldColumns(observedKeys)
  yield await encodeRow(buildHeaderRow(dataFieldColumns))

  for (const item of buffered) {
    for (const record of item.records) {
      yield await encodeRow(rowForRecord(item, record, dataFieldColumns))
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
