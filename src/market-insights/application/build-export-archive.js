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
 * Runs the read once and hands the same promise to everyone who asks.
 *
 * @template T
 * @param {() => Promise<T>} read
 * @returns {() => Promise<T>}
 */
const readOnce = (read) => {
  /** @type {Promise<T> | undefined} */
  let reading
  return () => (reading ??= read())
}

/**
 * The repositories as this export reads them: every builder sees the same
 * organisations and the same periodic reports, read once.
 *
 * That is what makes the files agree with each other. Sharing a clock reading
 * never did: seven builders reading in turn would each see the register as it
 * stood when they got to it, so a report submitted mid-build would land in some
 * nation's file and not another's.
 *
 * The memo is scoped to one call, and every builder here is given the same
 * `year`, so the ignored argument cannot hide a different question.
 *
 * @param {Pick<BuildExportArchiveParams, 'organisationsRepository' | 'reportsRepository'>} repositories
 * @param {number} year
 */
const asReadOnceForThisExport = (
  { organisationsRepository, reportsRepository },
  year
) => ({
  organisationsRepository: {
    ...organisationsRepository,
    findAll: readOnce(() => organisationsRepository.findAll())
  },
  reportsRepository: {
    ...reportsRepository,
    findPeriodicReportsForYear: readOnce(() =>
      reportsRepository.findPeriodicReportsForYear({ year })
    )
  }
})

/**
 * Every figure behind the market insights pages, as a zip of CSVs.
 *
 * The builders are called directly rather than over HTTP so that they can be
 * given one reading of the register between them, which is what makes the files
 * agree with each other. They run concurrently, so the wall time is the longest
 * build rather than the sum of seven.
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
  const shared = asReadOnceForThisExport(
    { organisationsRepository, reportsRepository },
    year
  )
  const common = { ...shared, logger, year, months, now }

  const [wasteBalance, scopeTables, outstandingReturns] = await Promise.all([
    buildWasteBalanceTable({
      ...common,
      ledgerRepository,
      summaryLogRowStatesRepository,
      overseasSitesRepository
    }),
    Promise.all(
      EXPORT_SCOPES.map((scope) =>
        buildReprocessorExporterTable({ ...common, regulator: scope.regulator })
      )
    ),
    buildOutstandingReturnsTable(common)
  ])

  const files = await Promise.all([
    csvFile(
      'waste-balance.csv',
      WASTE_BALANCE_COLUMNS,
      buildWasteBalanceRows(wasteBalance)
    ),
    ...scopeTables.flatMap((table, index) => [
      csvFile(
        `${EXPORT_SCOPES[index].name}-reprocessor.csv`,
        REPROCESSOR_COLUMNS,
        buildReprocessorRows(table)
      ),
      csvFile(
        `${EXPORT_SCOPES[index].name}-exporter.csv`,
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
      ...scopeTables.flatMap((table, index) =>
        buildReportCoverageRows(EXPORT_SCOPES[index].name, table)
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
