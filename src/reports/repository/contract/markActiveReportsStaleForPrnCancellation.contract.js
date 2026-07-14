import { beforeEach, describe, expect } from 'vitest'
import {
  buildCreateReportParams,
  createAndSubmitReport,
  DEFAULT_ORG_ID,
  DEFAULT_REG_ID,
  DEFAULT_REPORT_YEAR,
  DEFAULT_REPORT_PERIOD
} from './test-data.js'

const PRN_ID = 'prn-id-000000000000000000000001'
const OCCURRED_AT = '2026-06-01T12:00:00.000Z'

const DEFAULT_PARAMS = {
  organisationId: DEFAULT_ORG_ID,
  registrationId: DEFAULT_REG_ID,
  year: DEFAULT_REPORT_YEAR,
  cadence: 'monthly',
  period: DEFAULT_REPORT_PERIOD,
  prnId: PRN_ID,
  occurredAt: OCCURRED_AT
}

export const testMarkActiveReportsStaleForPrnCancellationBehaviour = (it) => {
  describe('markActiveReportsStaleForPrnCancellation', () => {
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

    it('marks the active report for the period stale and returns per-report result', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      const reportsMarkedStale =
        await repository.markActiveReportsStaleForPrnCancellation(
          DEFAULT_PARAMS
        )

      expect(reportsMarkedStale).toHaveLength(1)
      expect(reportsMarkedStale[0]).toMatchObject({
        reportId,
        year: DEFAULT_REPORT_YEAR,
        cadence: 'monthly',
        period: DEFAULT_REPORT_PERIOD,
        submissionNumber: expect.any(Number),
        stale: {
          prnCancelled: {
            occurredAt: OCCURRED_AT,
            prnId: PRN_ID
          }
        }
      })
    })

    it('returns [] when no active report exists for the period', async () => {
      const reportsMarkedStale =
        await repository.markActiveReportsStaleForPrnCancellation(
          DEFAULT_PARAMS
        )

      expect(reportsMarkedStale).toEqual([])
    })

    it('does not touch submitted reports', async () => {
      const reportId = await createAndSubmitReport(repository)

      const reportsMarkedStale =
        await repository.markActiveReportsStaleForPrnCancellation(
          DEFAULT_PARAMS
        )

      expect(reportsMarkedStale).toEqual([])
      const report = await repository.findReportById(reportId)
      expect(report.stale).toBeUndefined()
    })

    it('is idempotent — second call with same prnId returns []', async () => {
      await repository.createReport(buildCreateReportParams())

      const first =
        await repository.markActiveReportsStaleForPrnCancellation(
          DEFAULT_PARAMS
        )
      expect(first).toHaveLength(1)

      const second =
        await repository.markActiveReportsStaleForPrnCancellation(
          DEFAULT_PARAMS
        )
      expect(second).toEqual([])
    })

    it('does not clobber an existing stale.summaryLogChanged flag', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )
      await repository.markActiveReportsStaleForSummaryLog(
        DEFAULT_ORG_ID,
        DEFAULT_REG_ID,
        'sl-new',
        '2026-05-01T00:00:00.000Z'
      )

      await repository.markActiveReportsStaleForPrnCancellation(DEFAULT_PARAMS)

      const report = await repository.findReportById(reportId)
      expect(report.stale).toMatchObject({
        summaryLogChanged: {
          uploadedAt: '2026-05-01T00:00:00.000Z',
          summaryLogId: 'sl-new'
        },
        prnCancelled: {
          occurredAt: OCCURRED_AT,
          prnId: PRN_ID
        }
      })
    })

    it('throws validation error for invalid input', async () => {
      await expect(
        repository.markActiveReportsStaleForPrnCancellation({
          organisationId: '',
          registrationId: '',
          year: DEFAULT_REPORT_YEAR,
          cadence: 'monthly',
          period: DEFAULT_REPORT_PERIOD,
          prnId: '',
          occurredAt: ''
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })
  })
}
