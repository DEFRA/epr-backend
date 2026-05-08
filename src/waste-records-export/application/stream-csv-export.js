import { writeToString } from '@fast-csv/format'
import { Readable } from 'node:stream'

import { buildHeaderRow, buildDataRow } from '../domain/csv-columns.js'
import { isIncludedInWasteBalance } from '../domain/is-included-in-waste-balance.js'
import { buildOverseasSitesContext } from '../domain/overseas-sites-context.js'
import { loadSummaryLogMap } from './load-summary-log-map.js'

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
 * Yields CSV-encoded lines (header first, then one per waste record).
 * Hard-fails on any iterator error — caller must close the response stream.
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

  yield await encodeRow(buildHeaderRow())

  const orgs = await organisationsRepository.findAll()
  const orgsSorted = [...orgs].sort((a, b) => a.id.localeCompare(b.id))

  for (const org of orgsSorted) {
    const registrations = [...(org.registrations ?? [])].sort((a, b) =>
      a.id.localeCompare(b.id)
    )

    for (const registration of registrations) {
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
      const recordsSorted = [...records].sort((a, b) => {
        const t = a.type.localeCompare(b.type)
        return t || String(a.rowId).localeCompare(String(b.rowId))
      })

      for (const record of recordsSorted) {
        const lastVersion = record.versions.at(-1)
        const summaryLogId = lastVersion.summaryLog.id
        const summaryLogEntry = summaryLogMap.get(summaryLogId) ?? null

        const includedInWasteBalance = isIncludedInWasteBalance(
          record,
          accreditation,
          overseasSites
        )

        yield await encodeRow(
          buildDataRow({
            org,
            registration,
            record,
            summaryLogEntry,
            includedInWasteBalance
          })
        )
      }
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
