import archiver from 'archiver'
import { Readable } from 'node:stream'
import { writeToString } from '@fast-csv/format'

import { buildOutstandingReturnsTable } from '#market-insights/application/outstanding-returns.js'
import { buildReprocessorExporterTable } from '#market-insights/application/reprocessor-exporter-table.js'
import { buildWasteBalanceTable } from '#market-insights/application/waste-balance-table.js'
import {
  buildExporterRows,
  buildManifestRow,
  buildOutstandingReturnsRows,
  buildReprocessorRows,
  buildWasteBalanceRows,
  EXPORTER_COLUMNS,
  MANIFEST_COLUMNS,
  OUTSTANDING_RETURNS_COLUMNS,
  REPROCESSOR_COLUMNS,
  WASTE_BALANCE_COLUMNS
} from '#market-insights/domain/export-csv-rows.js'
import { REGULATOR_FOR_NATION_SEGMENT } from '#market-insights/domain/nation-segment.js'

/** @import { YearMonth } from '#common/helpers/dates/year-month.js' */
/** @import { CsvRow } from '#market-insights/domain/export-csv-rows.js' */

/**
 * @typedef {Object} ExportFile
 * @property {string} name
 * @property {string} contents
 */

/**
 * The five scopes the pages cover: the UK, drawn from every regulator, and one
 * per nation.
 *
 * @type {readonly { name: string, regulator?: import('#domain/organisations/model.js').RegulatorValue }[]}
 */
const EXPORT_SCOPES = Object.freeze([
  { name: 'uk' },
  ...Object.entries(REGULATOR_FOR_NATION_SEGMENT).map(([name, regulator]) => ({
    name,
    regulator
  }))
])

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
 * @typedef {Object} BuildExportArchiveParams
 * @property {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} ledgerRepository
 * @property {import('#waste-records/repository/port.js').SummaryLogRowStatesRepository} summaryLogRowStatesRepository
 * @property {import('#repositories/organisations/port.js').OrganisationsRepository} organisationsRepository
 * @property {import('#overseas-sites/repository/port.js').OverseasSitesRepository} overseasSitesRepository
 * @property {import('#reports/repository/port.js').ReportsRepository} reportsRepository
 * @property {import('#common/hapi-types.js').TypedLogger} logger
 * @property {number} year
 * @property {string} cadence
 * @property {number} period
 * @property {YearMonth[]} months - the reporting months to publish, in order
 * @property {Date} now - the one clock reading every file is taken at
 */

/**
 * The figures files, two per scope: the UK drawn from every regulator, and one
 * scope per nation. Two rather than four because the pages have already merged
 * the PRN and PERN measures into each accreditation type's table.
 *
 * @param {Pick<BuildExportArchiveParams, 'organisationsRepository' | 'reportsRepository' | 'logger' | 'year' | 'months' | 'now'>} params
 * @returns {Promise<ExportFile[]>}
 */
const reprocessorExporterFiles = async (params) => {
  /** @type {ExportFile[]} */
  const files = []

  for (const scope of EXPORT_SCOPES) {
    const table = await buildReprocessorExporterTable({
      ...params,
      regulator: scope.regulator
    })

    files.push(
      await csvFile(
        `${scope.name}-reprocessor.csv`,
        REPROCESSOR_COLUMNS,
        buildReprocessorRows(table)
      ),
      await csvFile(
        `${scope.name}-exporter.csv`,
        EXPORTER_COLUMNS,
        buildExporterRows(table)
      )
    )
  }

  return files
}

/**
 * Every figure behind the market insights pages, as a zip of CSVs.
 *
 * The builders are called directly rather than over HTTP so that one `now`
 * stamps all of them: five calls to the figures endpoint would give five
 * `generatedAt` values and five chances for the data to move between them.
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
export const buildMarketInsightsExportArchive = async ({
  ledgerRepository,
  summaryLogRowStatesRepository,
  organisationsRepository,
  overseasSitesRepository,
  reportsRepository,
  logger,
  year,
  cadence,
  period,
  months,
  now
}) => {
  const generatedAt = now.toISOString()

  /** @type {ExportFile[]} */
  const files = [
    await csvFile(
      'waste-balance.csv',
      WASTE_BALANCE_COLUMNS,
      buildWasteBalanceRows(
        await buildWasteBalanceTable({
          ledgerRepository,
          summaryLogRowStatesRepository,
          organisationsRepository,
          overseasSitesRepository,
          reportsRepository,
          logger,
          year,
          months,
          now
        })
      )
    )
  ]

  files.push(
    ...(await reprocessorExporterFiles({
      organisationsRepository,
      reportsRepository,
      logger,
      year,
      months,
      now
    }))
  )

  files.push(
    await csvFile(
      'outstanding-returns.csv',
      OUTSTANDING_RETURNS_COLUMNS,
      buildOutstandingReturnsRows(
        await buildOutstandingReturnsTable({
          organisationsRepository,
          reportsRepository,
          year,
          months,
          now
        })
      )
    ),
    await csvFile('manifest.csv', MANIFEST_COLUMNS, [
      buildManifestRow({ year, cadence, period, months, generatedAt })
    ])
  )

  return zip(files)
}
