import { STALE_REASON } from '#reports/domain/stale.js'
import { beforeEach, describe, expect } from 'vitest'
import {
  buildCreateReportParams,
  createAndSubmitReport,
  DEFAULT_ORG_ID,
  DEFAULT_REG_ID
} from './test-data.js'

const SL_ID = 'sl-id-new-000000000000000000000001'
const UPLOADED_AT = '2026-06-01T12:00:00.000Z'

export const testMarkActiveReportsStaleBehaviour = (it) => {
  describe('markActiveReportsStale', () => {
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

    it('marks active reports stale and returns per-report result', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      const reportsMarkedStale = await repository.markActiveReportsStale(
        DEFAULT_ORG_ID,
        DEFAULT_REG_ID,
        SL_ID,
        UPLOADED_AT
      )

      expect(reportsMarkedStale).toHaveLength(1)
      expect(reportsMarkedStale[0]).toMatchObject({
        reportId,
        year: expect.any(Number),
        cadence: expect.any(String),
        period: expect.any(Number),
        submissionNumber: expect.any(Number),
        stale: {
          at: UPLOADED_AT,
          reason: STALE_REASON.SUMMARY_LOG_CHANGED,
          summaryLogId: SL_ID
        }
      })
    })

    it('returns [] when no active reports exist', async () => {
      const reportsMarkedStale = await repository.markActiveReportsStale(
        DEFAULT_ORG_ID,
        DEFAULT_REG_ID,
        SL_ID,
        UPLOADED_AT
      )

      expect(reportsMarkedStale).toEqual([])
    })

    it('does not touch submitted reports', async () => {
      const reportId = await createAndSubmitReport(repository)

      const reportsMarkedStale = await repository.markActiveReportsStale(
        DEFAULT_ORG_ID,
        DEFAULT_REG_ID,
        SL_ID,
        UPLOADED_AT
      )

      expect(reportsMarkedStale).toEqual([])
      const report = await repository.findReportById(reportId)
      expect(report.stale).toBeUndefined()
    })

    it('is idempotent — second call with same summaryLogId returns []', async () => {
      await repository.createReport(buildCreateReportParams())

      const first = await repository.markActiveReportsStale(
        DEFAULT_ORG_ID,
        DEFAULT_REG_ID,
        SL_ID,
        UPLOADED_AT
      )
      expect(first).toHaveLength(1)

      const second = await repository.markActiveReportsStale(
        DEFAULT_ORG_ID,
        DEFAULT_REG_ID,
        SL_ID,
        UPLOADED_AT
      )
      expect(second).toEqual([])
    })

    it('skips reports whose source.summaryLogId matches the given summaryLogId', async () => {
      // Default source.summaryLogId is 'sl-1' (see test-data.js buildCreateReportParams)
      await repository.createReport(buildCreateReportParams())

      const reportsMarkedStale = await repository.markActiveReportsStale(
        DEFAULT_ORG_ID,
        DEFAULT_REG_ID,
        'sl-1',
        UPLOADED_AT
      )

      expect(reportsMarkedStale).toEqual([])
    })

    it('throws validation error for invalid input', async () => {
      await expect(
        repository.markActiveReportsStale('', '', '', '')
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })
  })
}
