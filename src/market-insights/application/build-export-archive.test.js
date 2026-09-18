import unzipper from 'unzipper'
import { assertPresent } from '#test/type-helpers.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { TONNAGE_MONITORING_MATERIALS } from '#domain/organisations/model.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { buildMarketInsightsExportArchive } from './build-export-archive.js'

const NOW = new Date('2026-09-18T14:15:30.000Z')
const JANUARY_TO_MARCH_2026 = ['2026-01', '2026-02', '2026-03'].map(toYearMonth)

const MATERIAL_COUNT = TONNAGE_MONITORING_MATERIALS.length

/**
 * @param {Buffer} body
 * @returns {Promise<Map<string, string>>}
 */
const readZip = async (body) => {
  const directory = await unzipper.Open.buffer(body)
  return new Map(
    await Promise.all(
      directory.files.map(async (file) => [
        file.path,
        (await file.buffer()).toString('utf8')
      ])
    )
  )
}

/**
 * @param {Map<string, string>} files
 * @param {string} name
 * @returns {string[]} the file's lines, header first
 */
const linesOf = (files, name) => {
  const contents = files.get(name)
  assertPresent(contents)
  return contents.trim().split('\n')
}

const run = async (months = JANUARY_TO_MARCH_2026) =>
  buildMarketInsightsExportArchive({
    ledgerRepository: createInMemoryLedgerRepository()(),
    summaryLogRowStatesRepository:
      createInMemorySummaryLogRowStatesRepository()(),
    organisationsRepository: createInMemoryOrganisationsRepository([])(),
    overseasSitesRepository: createInMemoryOverseasSitesRepository([])(),
    reportsRepository: createInMemoryReportsRepository()(),
    logger: /** @type {any} */ ({ info: vi.fn(), warn: vi.fn() }),
    year: 2026,
    cadence: 'monthly',
    period: 3,
    months,
    now: NOW
  })

describe('building the market insights export archive', () => {
  it('holds one file per logical table, with a month column rather than a table per month', async () => {
    const { body } = await run()

    expect([...(await readZip(body)).keys()].sort()).toEqual([
      'england-exporter.csv',
      'england-reprocessor.csv',
      'manifest.csv',
      'northern-ireland-exporter.csv',
      'northern-ireland-reprocessor.csv',
      'outstanding-returns.csv',
      'scotland-exporter.csv',
      'scotland-reprocessor.csv',
      'uk-exporter.csv',
      'uk-reprocessor.csv',
      'wales-exporter.csv',
      'wales-reprocessor.csv',
      'waste-balance.csv'
    ])
  })

  it('records the reporting period and the moment the figures were taken', async () => {
    const { body, generatedAt } = await run()

    expect(generatedAt).toBe('2026-09-18T14:15:30.000Z')
    expect((await readZip(body)).get('manifest.csv')).toBe(
      'reporting_year,cadence,period,period_start,period_end,generated_at\n' +
        '2026,monthly,3,2026-01,2026-03,2026-09-18T14:15:30.000Z\n'
    )
  })

  it('collapses the per-month repetition into a month column', async () => {
    const files = await readZip((await run()).body)

    const ukReprocessor = linesOf(files, 'uk-reprocessor.csv')
    expect(ukReprocessor[0]).toBe(
      'month,material,tonnage_received,tonnage_recycled,tonnage_received_but_not_recycled,tonnage_sent_on_total,tonnage_sent_on_to_reprocessor,tonnage_sent_on_to_exporter,tonnage_sent_on_to_other_facilities,revised_tonnage_issued,total_revenue,average_price_per_tonne'
    )
    expect(ukReprocessor).toHaveLength(1 + 3 * MATERIAL_COUNT)
    expect(ukReprocessor[1]).toMatch(/^2026-01,/)
    expect(ukReprocessor.at(-1)).toMatch(/^2026-03,/)
  })

  it('does not lengthen the file list as the reporting period lengthens', async () => {
    const short = await readZip((await run([toYearMonth('2026-01')])).body)
    const long = await readZip((await run()).body)

    expect(short.size).toBe(long.size)
    expect(linesOf(short, 'waste-balance.csv')).toHaveLength(
      1 + MATERIAL_COUNT * 2
    )
    expect(linesOf(long, 'waste-balance.csv')).toHaveLength(
      1 + 3 * MATERIAL_COUNT * 2
    )
  })

  it('takes every file from the one moment the caller supplied, not from the clock as it moves', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2027-01-01T00:00:00.000Z'))

    const { body, generatedAt } = await run()

    expect(generatedAt).toBe(NOW.toISOString())
    expect((await readZip(body)).get('manifest.csv')).toContain(
      NOW.toISOString()
    )
    vi.useRealTimers()
  })
})
