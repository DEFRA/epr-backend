import { beforeEach, describe, expect } from 'vitest'
import {
  buildCreateReportParams,
  createAndSubmitReport,
  DEFAULT_CHANGED_BY,
  DEFAULT_ORG_ID,
  DEFAULT_REG_ID,
  DEFAULT_REPORT_YEAR,
  DEFAULT_REPORT_PERIOD
} from './test-data.js'

/**
 * @import { ReportsRepository } from '#reports/repository/port.js'
 */

const SL_ID = 'sl-restated'
const UPLOADED_AT = '2026-05-01T00:00:00.000Z'
const REQUESTED_AT = '2026-06-01T12:00:00.000Z'

const PERIOD = {
  year: DEFAULT_REPORT_YEAR,
  cadence: 'monthly',
  period: DEFAULT_REPORT_PERIOD
}

export const testClearClosedPeriodRestatedBehaviour = (it) => {
  describe('clearClosedPeriodRestated', () => {
    let repository

    beforeEach(
      async (
        /** @type {{ reportsRepository: () => ReportsRepository }} */ {
          reportsRepository
        }
      ) => {
        repository = reportsRepository()
      }
    )

    const flagFrom = (summaryLogId) =>
      repository.markSubmittedReportsRequiringResubmission({
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID,
        summaryLogId,
        uploadedAt: UPLOADED_AT,
        periods: [PERIOD]
      })

    it('removes the flag and returns what it cleared', async () => {
      const reportId = await createAndSubmitReport(repository)
      await flagFrom(SL_ID)
      const flagged = await repository.findReportById(reportId)

      const result = await repository.clearClosedPeriodRestated({
        reportId,
        summaryLogId: SL_ID
      })

      expect(result).toEqual({
        reportId,
        ...PERIOD,
        submissionNumber: 1,
        closedPeriodRestated: { uploadedAt: UPLOADED_AT, summaryLogId: SL_ID }
      })
      const report = await repository.findReportById(reportId)
      expect(report.resubmissionRequired).toBeUndefined()
      expect(report.version).toBe(flagged.version + 1)
    })

    it("keeps the operator's own resubmission request", async () => {
      const reportId = await createAndSubmitReport(repository)
      await flagFrom(SL_ID)
      await repository.markSubmittedReportRequiringResubmissionByOperator({
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID,
        ...PERIOD,
        submissionNumber: 1,
        requestedBy: DEFAULT_CHANGED_BY,
        requestedAt: REQUESTED_AT
      })

      await repository.clearClosedPeriodRestated({
        reportId,
        summaryLogId: SL_ID
      })

      const report = await repository.findReportById(reportId)
      expect(report.resubmissionRequired).toEqual({
        operatorRequested: {
          requestedAt: REQUESTED_AT,
          requestedBy: DEFAULT_CHANGED_BY
        }
      })
    })

    it('leaves a flag a later summary log set', async () => {
      const reportId = await createAndSubmitReport(repository)
      await flagFrom('sl-later')
      const flagged = await repository.findReportById(reportId)

      const result = await repository.clearClosedPeriodRestated({
        reportId,
        summaryLogId: SL_ID
      })

      expect(result).toBeNull()
      expect(await repository.findReportById(reportId)).toEqual(flagged)
    })

    it('returns null when the report is not flagged', async () => {
      const reportId = await createAndSubmitReport(repository)

      const result = await repository.clearClosedPeriodRestated({
        reportId,
        summaryLogId: SL_ID
      })

      expect(result).toBeNull()
    })

    it('returns null when the report is no longer submitted', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      const result = await repository.clearClosedPeriodRestated({
        reportId,
        summaryLogId: SL_ID
      })

      expect(result).toBeNull()
    })

    it('throws validation error for invalid input', async () => {
      await expect(
        repository.clearClosedPeriodRestated({ reportId: '', summaryLogId: '' })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })
  })
}
