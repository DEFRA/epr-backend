import { MARKET_INSIGHTS_EXPORT_STATUS } from '#market-insights/domain/export.js'
import { assertPresent } from '#test/type-helpers.js'
import { claimAt, JUNE_2026 } from './test-data.js'

/** @import { MarketInsightsExportsRepository } from '../port.js' */

const NOW = new Date('2026-09-18T14:15:30.000Z')
const SIX_MINUTES_LATER = new Date('2026-09-18T14:21:30.000Z')
const S3_KEY =
  'market-insights/market-insights-2026-monthly-6-2026-09-18-141530.zip'

export const testBuildOutcomeBehaviour = (it) => {
  describe('recording what a build produced', () => {
    /** @type {MarketInsightsExportsRepository} */
    let repository

    beforeEach(
      async (
        /** @type {{ marketInsightsExportsRepository: MarketInsightsExportsRepository }} */ {
          marketInsightsExportsRepository
        }
      ) => {
        repository = marketInsightsExportsRepository
      }
    )

    it('records the stored zip and the moment its figures were taken', async () => {
      const { record } = await claimAt(repository, NOW)

      expect(
        await repository.markReady({
          id: record.id,
          buildToken: record.buildToken,
          generatedAt: '2026-09-18T14:15:30.000Z',
          s3Key: S3_KEY,
          now: NOW
        })
      ).toBe(true)

      const found = await repository.findForPeriod(JUNE_2026)
      assertPresent(found)
      expect(found.status).toBe(MARKET_INSIGHTS_EXPORT_STATUS.READY)
      expect(found.generatedAt).toBe('2026-09-18T14:15:30.000Z')
      expect(found.s3Key).toBe(S3_KEY)
    })

    it('records a failure with a reason the wait page can show', async () => {
      const { record } = await claimAt(repository, NOW)

      expect(
        await repository.markFailed({
          id: record.id,
          buildToken: record.buildToken,
          failureReason: 'The figures could not be read',
          now: NOW
        })
      ).toBe(true)

      const found = await repository.findForPeriod(JUNE_2026)
      assertPresent(found)
      expect(found.status).toBe(MARKET_INSIGHTS_EXPORT_STATUS.FAILED)
      expect(found.failureReason).toBe('The figures could not be read')
    })

    it('refuses a write from a build the period has moved on from', async () => {
      const abandoned = await claimAt(repository, NOW)
      const current = await claimAt(repository, SIX_MINUTES_LATER)

      // The abandoned build comes back to life and tries to finish.
      expect(
        await repository.markReady({
          id: abandoned.record.id,
          buildToken: abandoned.record.buildToken,
          generatedAt: NOW.toISOString(),
          s3Key: S3_KEY,
          now: SIX_MINUTES_LATER
        })
      ).toBe(false)
      expect(
        await repository.markFailed({
          id: abandoned.record.id,
          buildToken: abandoned.record.buildToken,
          failureReason: 'too late to matter',
          now: SIX_MINUTES_LATER
        })
      ).toBe(false)

      const found = await repository.findForPeriod(JUNE_2026)
      assertPresent(found)
      expect(found.status).toBe(MARKET_INSIGHTS_EXPORT_STATUS.BUILDING)
      expect(found.buildToken).toBe(current.record.buildToken)
    })

    it('answers false for a period nobody has exported', async () => {
      expect(
        await repository.markReady({
          id: 'no-such-period',
          buildToken: 'no-such-build',
          generatedAt: NOW.toISOString(),
          s3Key: S3_KEY,
          now: NOW
        })
      ).toBe(false)
      expect(
        await repository.markFailed({
          id: 'no-such-period',
          buildToken: 'no-such-build',
          failureReason: 'nothing to fail',
          now: NOW
        })
      ).toBe(false)
    })
  })
}
