import archiver from 'archiver'
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
 * @param {ExportFile[]} files
 * @returns {Promise<Buffer>}
 */
const zip = async (files) => {
  const archive = archiver('zip', { zlib: { level: 9 } })
  /** @type {Buffer[]} */
  const chunks = []
  archive.on('data', (chunk) => chunks.push(chunk))

  const written = new Promise((resolve, reject) => {
    archive.on('end', resolve)
    archive.on('error', reject)
  })

  for (const { name, contents } of files) {
    archive.append(contents, { name })
  }
  await archive.finalize()
  await written

  return Buffer.concat(chunks)
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
 * Every figure behind the market insights pages, as a zip of CSVs.
 *
 * The builders are called directly rather than over HTTP so that one `now`
 * stamps all of them: five calls to the figures endpoint would give five
 * `generatedAt` values and five chances for the data to move between them.
 *
 * The per-month repetition the pages render collapses into a `month` column, so
 * the file count does not grow as the reporting period lengthens.
 *
 * @param {BuildExportArchiveParams} params
 * @returns {Promise<{ body: Buffer, generatedAt: string }>}
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

  for (const scope of EXPORT_SCOPES) {
    const table = await buildReprocessorExporterTable({
      organisationsRepository,
      reportsRepository,
      logger,
      year,
      months,
      regulator: scope.regulator,
      now
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

  return { body: await zip(files), generatedAt }
}
