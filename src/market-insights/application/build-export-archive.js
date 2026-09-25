import archiver from 'archiver'
import { Readable } from 'node:stream'
import { writeToString } from '@fast-csv/format'

import { readMarketInsightsFigures } from '#market-insights/application/read-figures.js'
import {
  buildExporterRows,
  buildManifestRow,
  buildOutstandingReturnsRows,
  buildReportCoverageRows,
  buildReprocessorRows,
  buildWasteBalanceRows,
  EXPORTER_COLUMNS,
  MANIFEST_COLUMNS,
  OUTSTANDING_RETURNS_COLUMNS,
  REPORTS_COLUMNS,
  REPROCESSOR_COLUMNS,
  WASTE_BALANCE_COLUMNS
} from '#market-insights/domain/export-csv-rows.js'

/** @import { CsvRow } from '#market-insights/domain/export-csv-rows.js' */

/**
 * @typedef {Object} ExportFile
 * @property {string} name
 * @property {string} contents
 */

/**
 * @param {string} name
 * @param {readonly string[]} columns
 * @param {CsvRow[]} rows
 * @returns {Promise<ExportFile>}
 */
const csvFile = async (name, columns, rows) => ({
  name,
  contents: `${await writeToString([[...columns], ...rows], { headers: false })}\n`
})

/**
 * The archive is returned part-written: `finalize` is deliberately not awaited,
 * so the caller can pipe it out while archiver is still compressing.
 *
 * Adapted to a Node `Readable` because archiver is built on the userland
 * `readable-stream`, which Hapi does not recognise as a response source.
 * `objectMode: false` keeps each chunk an HTTP body chunk rather than a value.
 *
 * @param {ExportFile[]} files
 * @returns {Readable}
 */
const zip = (files) => {
  const archive = archiver('zip', { zlib: { level: 9 } })

  for (const { name, contents } of files) {
    archive.append(contents, { name })
  }
  // A failure while compressing tears the stream down, so the response errors
  // rather than truncating silently.
  archive.finalize().catch((error) => archive.destroy(error))

  return Readable.from(archive, { objectMode: false })
}

/**
 * @typedef {import('#market-insights/application/read-figures.js').ReadMarketInsightsFiguresParams & {
 *   cadence: string,
 *   period: number
 * }} BuildExportArchiveParams
 */

/**
 * Every figure behind the market insights pages, as a zip of CSVs.
 *
 * The per-month repetition the pages render collapses into a `month` column, so
 * the file count does not grow as the reporting period lengthens.
 *
 * Every dataset is assembled before the archive is returned, so a repository
 * failure surfaces as a thrown error rather than part-way through a response
 * already being written.
 *
 * @param {BuildExportArchiveParams} params
 * @returns {Promise<Readable>}
 */
export const buildMarketInsightsExportArchive = async (params) => {
  const { year, cadence, period, months, now } = params
  const { wasteBalance, scopes, outstandingReturns } =
    await readMarketInsightsFigures(params)

  const files = await Promise.all([
    csvFile(
      'waste-balance.csv',
      WASTE_BALANCE_COLUMNS,
      buildWasteBalanceRows(wasteBalance)
    ),
    ...scopes.flatMap(({ name, table }) => [
      csvFile(
        `${name}-reprocessor.csv`,
        REPROCESSOR_COLUMNS,
        buildReprocessorRows(table)
      ),
      csvFile(
        `${name}-exporter.csv`,
        EXPORTER_COLUMNS,
        buildExporterRows(table)
      )
    ]),
    csvFile(
      'outstanding-returns.csv',
      OUTSTANDING_RETURNS_COLUMNS,
      buildOutstandingReturnsRows(outstandingReturns)
    ),
    csvFile('reports.csv', REPORTS_COLUMNS, [
      ...buildReportCoverageRows('waste-balance', wasteBalance),
      ...scopes.flatMap(({ name, table }) =>
        buildReportCoverageRows(name, table)
      )
    ]),
    csvFile('manifest.csv', MANIFEST_COLUMNS, [
      buildManifestRow({
        year,
        cadence,
        period,
        months,
        generatedAt: now.toISOString()
      })
    ])
  ])

  return zip(files)
}
