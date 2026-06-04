import { STALE_REASON } from '#reports/domain/stale.js'
import { beforeEach, describe, expect } from 'vitest'
import { buildCreateReportParams } from './test-data.js'

const buildStale = (overrides = {}) => ({
  at: new Date().toISOString(),
  reason: STALE_REASON.SUMMARY_LOG_CHANGED,
  ...overrides
})

export const testMarkReportStaleBehaviour = (it) => {
  describe('markReportStale', () => {
    let repository

    beforeEach(
      async (
        /** @type {{ reportsRepository: () => import('#reports/repository/port.js').ReportsRepository }} */ {
          reportsRepository
        }
      ) => {
        repository = reportsRepository()
      }
    )

    it('sets the stale field and increments version', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      const stale = buildStale()
      const updated = await repository.markReportStale(reportId, 1, stale)

      expect(updated).toMatchObject({
        id: reportId,
        version: 2,
        stale: {
          at: stale.at,
          reason: STALE_REASON.SUMMARY_LOG_CHANGED
        }
      })
    })

    it('throws conflict when version does not match', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      await expect(
        repository.markReportStale(reportId, 99, buildStale())
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 409 } })
    })

    it('throws notFound for unknown reportId', async () => {
      await expect(
        repository.markReportStale('unknown-id', 1, buildStale())
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 404 } })
    })

    it('throws validation error for unknown reason', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      await expect(
        repository.markReportStale(reportId, 1, {
          at: new Date().toISOString(),
          reason: 'not_a_valid_reason'
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })
  })
}
