import { beforeEach, describe, expect } from 'vitest'
import {
  buildCreateReportParams,
  createAndSubmitReport,
  DEFAULT_ORG_ID,
  DEFAULT_REG_ID
} from './test-data.js'

const SL_ID = 'sl-id-new-000000000000000000000001'
const UPLOADED_AT = '2026-06-01T12:00:00.000Z'

export const testMarkActiveReportsStaleForSummaryLogBehaviour = (it) => {
  describe('markActiveReportsStaleForSummaryLog', () => {
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

      const reportsMarkedStale =
        await repository.markActiveReportsStaleForSummaryLog(
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
          summaryLogChanged: {
            uploadedAt: UPLOADED_AT,
            summaryLogId: SL_ID
          }
        }
      })
    })

    it('returns [] when no active reports exist', async () => {
      const reportsMarkedStale =
        await repository.markActiveReportsStaleForSummaryLog(
          DEFAULT_ORG_ID,
          DEFAULT_REG_ID,
          SL_ID,
          UPLOADED_AT
        )

      expect(reportsMarkedStale).toEqual([])
    })

    it('does not touch submitted reports', async () => {
      const reportId = await createAndSubmitReport(repository)

      const reportsMarkedStale =
        await repository.markActiveReportsStaleForSummaryLog(
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

      const first = await repository.markActiveReportsStaleForSummaryLog(
        DEFAULT_ORG_ID,
        DEFAULT_REG_ID,
        SL_ID,
        UPLOADED_AT
      )
      expect(first).toHaveLength(1)

      const second = await repository.markActiveReportsStaleForSummaryLog(
        DEFAULT_ORG_ID,
        DEFAULT_REG_ID,
        SL_ID,
        UPLOADED_AT
      )
      expect(second).toEqual([])
    })

    it('does not overwrite the first summary log when a different one is uploaded afterwards', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      const first = await repository.markActiveReportsStaleForSummaryLog(
        DEFAULT_ORG_ID,
        DEFAULT_REG_ID,
        SL_ID,
        UPLOADED_AT
      )
      expect(first).toHaveLength(1)

      const second = await repository.markActiveReportsStaleForSummaryLog(
        DEFAULT_ORG_ID,
        DEFAULT_REG_ID,
        'sl-id-new-000000000000000000000002',
        '2026-06-02T12:00:00.000Z'
      )
      expect(second).toEqual([])

      const report = await repository.findReportById(reportId)
      expect(report.stale.summaryLogChanged).toEqual({
        uploadedAt: UPLOADED_AT,
        summaryLogId: SL_ID
      })
    })

    it('skips reports whose source.summaryLogId matches the given summaryLogId', async () => {
      // Default source.summaryLogId is 'sl-1' (see test-data.js buildCreateReportParams)
      await repository.createReport(buildCreateReportParams())

      const reportsMarkedStale =
        await repository.markActiveReportsStaleForSummaryLog(
          DEFAULT_ORG_ID,
          DEFAULT_REG_ID,
          'sl-1',
          UPLOADED_AT
        )

      expect(reportsMarkedStale).toEqual([])
    })

    it('does not clobber an existing stale.prnCancelled flag', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )
      await repository.markActiveReportsStaleForPrnCancellation({
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID,
        year: 2024,
        cadence: 'monthly',
        period: 1,
        prnId: 'prn-1',
        occurredAt: '2026-05-01T00:00:00.000Z'
      })

      await repository.markActiveReportsStaleForSummaryLog(
        DEFAULT_ORG_ID,
        DEFAULT_REG_ID,
        SL_ID,
        UPLOADED_AT
      )

      const report = await repository.findReportById(reportId)
      expect(report.stale).toMatchObject({
        summaryLogChanged: { uploadedAt: UPLOADED_AT, summaryLogId: SL_ID },
        prnCancelled: { occurredAt: '2026-05-01T00:00:00.000Z', prnId: 'prn-1' }
      })
    })

    it('throws validation error for invalid input', async () => {
      await expect(
        repository.markActiveReportsStaleForSummaryLog('', '', '', '')
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })
  })
}
