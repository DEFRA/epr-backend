import unzipper from 'unzipper'
import { MARKET_INSIGHTS_EXPORT_STATUS } from '#market-insights/domain/export.js'
import { createInMemoryMarketInsightsExportsRepository } from '#market-insights/exports/repository/inmemory.js'
import { createInMemoryMarketInsightsExportStore } from '#market-insights/exports/store/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import {
  marketInsightsExportCommandHandlers,
  marketInsightsExportHandler
} from './market-insights-export-commands.js'

const NOW = new Date('2026-09-18T14:15:30.000Z')
const FEBRUARY_2026 = { year: 2026, cadence: 'monthly', period: 2 }

describe('marketInsightsExportCommandHandlers', () => {
  let deps
  let repository
  let store

  beforeEach(() => {
    repository = createInMemoryMarketInsightsExportsRepository()()
    store = createInMemoryMarketInsightsExportStore()
    deps = {
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      marketInsightsExportsRepository: repository,
      marketInsightsExportStore: store,
      ledgerRepository: createInMemoryLedgerRepository()(),
      summaryLogRowStatesRepository:
        createInMemorySummaryLogRowStatesRepository()(),
      organisationsRepository: createInMemoryOrganisationsRepository([])(),
      overseasSitesRepository: createInMemoryOverseasSitesRepository([])(),
      reportsRepository: createInMemoryReportsRepository()()
    }
  })

  const claim = () =>
    repository.claimForBuild({
      ...FEBRUARY_2026,
      now: NOW,
      abandonedBefore: '2026-09-18T14:10:30.000Z'
    })

  /** @param {{ id: string, buildToken: string }} record */
  const command = (record) => ({
    exportId: record.id,
    buildToken: record.buildToken,
    ...FEBRUARY_2026,
    months: ['2026-01', '2026-02']
  })

  it('exports one handler, for the market insights export command', () => {
    expect(marketInsightsExportCommandHandlers).toHaveLength(1)
    expect(marketInsightsExportHandler.command).toBe('market-insights-export')
  })

  describe('the payload', () => {
    it('accepts the period and build the route settled', async () => {
      const { record } = await claim()

      const { error } = marketInsightsExportHandler.payloadSchema.validate(
        command(record)
      )

      expect(error).toBeUndefined()
    })

    it('refuses a command carrying no build to write back to', async () => {
      const { record } = await claim()
      const { buildToken: _dropped, ...withoutToken } = command(record)

      const { error } =
        marketInsightsExportHandler.payloadSchema.validate(withoutToken)

      expect(error).toBeDefined()
    })
  })

  describe('building the export', () => {
    it('stores the zip under a key naming the period and the moment, and marks it ready', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(NOW)
      const { record } = await claim()

      await marketInsightsExportHandler.execute(command(record), deps)

      const found = await repository.findForPeriod(FEBRUARY_2026)
      expect(found.status).toBe(MARKET_INSIGHTS_EXPORT_STATUS.READY)
      expect(found.s3Key).toBe(
        'market-insights/market-insights-2026-monthly-2-2026-09-18-141530.zip'
      )
      expect(found.generatedAt).toBe(NOW.toISOString())

      const directory = await unzipper.Open.buffer(store.read(found.s3Key))
      expect(directory.files).toHaveLength(13)
      vi.useRealTimers()
    })

    it('gives a rebuild its own object, leaving the earlier one readable', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(NOW)
      const first = await claim()
      await marketInsightsExportHandler.execute(command(first.record), deps)
      const firstKey = (await repository.findForPeriod(FEBRUARY_2026)).s3Key

      const later = new Date('2026-09-18T17:15:30.000Z')
      vi.setSystemTime(later)
      const rebuild = await repository.claimForBuild({
        ...FEBRUARY_2026,
        now: later,
        abandonedBefore: '2026-09-18T17:10:30.000Z'
      })
      await marketInsightsExportHandler.execute(command(rebuild.record), deps)

      const found = await repository.findForPeriod(FEBRUARY_2026)
      expect(found.status).toBe(MARKET_INSIGHTS_EXPORT_STATUS.READY)
      expect(found.s3Key).not.toBe(firstKey)
      // Whoever was reading the first object still can.
      expect(store.read(firstKey)).toBeDefined()
      expect(store.read(found.s3Key)).toBeDefined()
      vi.useRealTimers()
    })

    it('discards its result when the period has been claimed by a later build', async () => {
      const abandoned = await claim()
      const current = await repository.claimForBuild({
        ...FEBRUARY_2026,
        now: new Date('2026-09-18T14:21:30.000Z'),
        abandonedBefore: '2026-09-18T14:16:30.000Z'
      })

      await marketInsightsExportHandler.execute(command(abandoned.record), deps)

      const found = await repository.findForPeriod(FEBRUARY_2026)
      expect(found.status).toBe(MARKET_INSIGHTS_EXPORT_STATUS.BUILDING)
      expect(found.buildToken).toBe(current.record.buildToken)
      expect(deps.logger.info).toHaveBeenCalled()
    })

    it('lets a failure inside the build surface, so the queue can retry it', async () => {
      const { record } = await claim()
      deps.organisationsRepository = {
        findAll: async () => {
          throw new Error('the register is unreachable')
        }
      }

      await expect(
        marketInsightsExportHandler.execute(command(record), deps)
      ).rejects.toThrow('the register is unreachable')
      expect((await repository.findForPeriod(FEBRUARY_2026)).status).toBe(
        MARKET_INSIGHTS_EXPORT_STATUS.BUILDING
      )
    })
  })

  describe('when the command fails terminally', () => {
    it('records a reason the wait page can show', async () => {
      const { record } = await claim()

      await marketInsightsExportHandler.onFailure(command(record), deps)

      const found = await repository.findForPeriod(FEBRUARY_2026)
      expect(found.status).toBe(MARKET_INSIGHTS_EXPORT_STATUS.FAILED)
      expect(found.failureReason).toBe('The export could not be built')
    })

    it('logs rather than throwing when the record cannot be written', async () => {
      const { record } = await claim()
      deps.marketInsightsExportsRepository = {
        markFailed: async () => {
          throw new Error('mongo is unreachable')
        }
      }

      await expect(
        marketInsightsExportHandler.onFailure(command(record), deps)
      ).resolves.toBeUndefined()
      expect(deps.logger.error).toHaveBeenCalled()
    })
  })

  it('describes the command by the period it is building', async () => {
    const { record } = await claim()

    expect(marketInsightsExportHandler.describe(command(record))).toBe(
      'exportId=2026-monthly-02'
    )
  })
})
