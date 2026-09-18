import { Readable } from 'node:stream'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'

const finalize = vi.fn()

// Archiver is mocked in this file alone so the rest of the suite keeps the real
// one: a genuine archive cannot be made to fail while compressing when
// everything appended to it is a string.
vi.mock('archiver', () => ({
  default: () => {
    // Produces nothing on its own, so the only way the stream ends is the
    // teardown under test.
    const archive = new Readable({ read() {} })
    return Object.assign(archive, { append: vi.fn(), finalize })
  }
}))

const { buildMarketInsightsExportArchive } =
  await import('./build-export-archive.js')

const run = () =>
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
    period: 1,
    months: [toYearMonth('2026-01')],
    now: new Date('2026-09-18T14:15:30.000Z')
  })

/** @param {Readable} archive */
const drain = async (archive) => {
  for await (const _chunk of archive) {
    // The stream under test yields nothing; draining it is how the failure
    // surfaces.
  }
}

describe('when the archive fails while compressing', () => {
  it('tears the stream down so the response errors rather than truncating silently', async () => {
    finalize.mockRejectedValue(new Error('compression failed'))

    await expect(drain(await run())).rejects.toThrow('compression failed')
  })
})
