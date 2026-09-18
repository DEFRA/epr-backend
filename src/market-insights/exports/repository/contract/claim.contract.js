import { MARKET_INSIGHTS_EXPORT_STATUS } from '#market-insights/domain/export.js'
import { assertPresent } from '#test/type-helpers.js'
import { claimAt, JUNE_2026 } from './test-data.js'

/** @import { MarketInsightsExportsRepository } from '../port.js' */

const NOW = new Date('2026-09-18T14:15:30.000Z')
const A_MOMENT_LATER = new Date('2026-09-18T14:15:33.000Z')
const SIX_MINUTES_LATER = new Date('2026-09-18T14:21:30.000Z')
const S3_KEY =
  'market-insights/market-insights-2026-monthly-6-2026-09-18-141530.zip'

export const testClaimBehaviour = (it) => {
  describe('claimForBuild', () => {
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

    /**
     * @param {{ id: string, buildToken: string }} record
     * @param {Date} [now]
     */
    const finish = (record, now = NOW) =>
      repository.markReady({
        id: record.id,
        buildToken: record.buildToken,
        generatedAt: now.toISOString(),
        s3Key: S3_KEY,
        now
      })

    /**
     * @param {{ id: string, buildToken: string }} record
     * @param {Date} [now]
     */
    const fail = (record, now = NOW) =>
      repository.markFailed({
        id: record.id,
        buildToken: record.buildToken,
        failureReason: 'The figures could not be read',
        now
      })

    it('claims a period nothing has exported yet, and records it as building', async () => {
      const { record, claimed } = await claimAt(repository, NOW)

      expect(claimed).toBe(true)
      expect(record.status).toBe(MARKET_INSIGHTS_EXPORT_STATUS.BUILDING)
      expect(record.buildToken).toEqual(expect.any(String))
      expect(record.generatedAt).toBeNull()
      expect(record.s3Key).toBeNull()
      expect(record).toMatchObject(JUNE_2026)
    })

    it('answers null for a period nobody has asked for', async () => {
      expect(await repository.findForPeriod(JUNE_2026)).toBeNull()
    })

    it('keeps reporting periods apart', async () => {
      await claimAt(repository, NOW)

      expect(
        await repository.findForPeriod({ ...JUNE_2026, period: 5 })
      ).toBeNull()
      expect(
        await repository.findForPeriod({ ...JUNE_2026, year: 2025 })
      ).toBeNull()
    })

    it('starts one build however many requests arrive together', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () => claimAt(repository, NOW))
      )

      expect(results.filter(({ claimed }) => claimed)).toHaveLength(1)
      expect(new Set(results.map(({ record }) => record.id)).size).toBe(1)
    })

    it('joins a build already running rather than starting a second', async () => {
      const first = await claimAt(repository, NOW)

      const poll = await claimAt(repository, A_MOMENT_LATER)

      expect(poll.claimed).toBe(false)
      expect(poll.record.buildToken).toBe(first.record.buildToken)
    })

    it('takes a fresh snapshot once an earlier build has finished', async () => {
      const first = await claimAt(repository, NOW)
      await finish(first.record)

      const next = await claimAt(repository, A_MOMENT_LATER)

      expect(next.claimed).toBe(true)
      expect(next.record.id).toBe(first.record.id)
      expect(next.record.status).toBe(MARKET_INSIGHTS_EXPORT_STATUS.BUILDING)
      expect(next.record.buildToken).not.toBe(first.record.buildToken)
    })

    it('builds again straight after a failure, rather than repeating it', async () => {
      const first = await claimAt(repository, NOW)
      await fail(first.record)

      const retry = await claimAt(repository, A_MOMENT_LATER)

      expect(retry.claimed).toBe(true)
      expect(retry.record.id).toBe(first.record.id)
      expect(retry.record.status).toBe(MARKET_INSIGHTS_EXPORT_STATUS.BUILDING)
      expect(retry.record.failureReason).toBeNull()
    })

    it('builds again once a build has been abandoned unfinished', async () => {
      const first = await claimAt(repository, NOW)

      const retry = await claimAt(repository, SIX_MINUTES_LATER)

      expect(retry.claimed).toBe(true)
      expect(retry.record.id).toBe(first.record.id)
      expect(retry.record.buildToken).not.toBe(first.record.buildToken)
    })

    it('keeps the period to one record however often it is rebuilt', async () => {
      const first = await claimAt(repository, NOW)
      await finish(first.record)
      const second = await claimAt(repository, A_MOMENT_LATER)
      await finish(second.record, A_MOMENT_LATER)
      await claimAt(repository, SIX_MINUTES_LATER)

      const found = await repository.findForPeriod(JUNE_2026)
      assertPresent(found)
      expect(found.id).toBe(first.record.id)
    })

    it('stamps the claim from the clock the caller read', async () => {
      const { record } = await claimAt(repository, NOW)

      const found = await repository.findForPeriod(JUNE_2026)
      assertPresent(found)

      expect(found.buildToken).toBe(record.buildToken)
      expect(found.updatedAt).toBe(NOW.toISOString())
    })
  })
}
