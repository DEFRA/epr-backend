import { beforeEach, describe, expect } from 'vitest'
import {
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

    const flaggedReport = async () => {
      const reportId = await createAndSubmitReport(repository)
      await flagFrom('sl-restated')
      return repository.findReportById(reportId)
    }

    it('removes the flag from the report as it was read', async () => {
      const flagged = await flaggedReport()

      const cleared = await repository.clearClosedPeriodRestated({
        reportId: flagged.id,
        version: flagged.version
      })

      expect(cleared).toBe(true)
      const report = await repository.findReportById(flagged.id)
      expect(report.resubmissionRequired).toBeUndefined()
      expect(report.version).toBe(flagged.version + 1)
    })

    it("keeps the operator's own resubmission request", async () => {
      const reportId = await createAndSubmitReport(repository)
      await repository.markSubmittedReportRequiringResubmissionByOperator({
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID,
        ...PERIOD,
        submissionNumber: 1,
        requestedBy: DEFAULT_CHANGED_BY,
        requestedAt: REQUESTED_AT
      })
      await flagFrom('sl-restated')
      const flagged = await repository.findReportById(reportId)

      await repository.clearClosedPeriodRestated({
        reportId,
        version: flagged.version
      })

      const report = await repository.findReportById(reportId)
      expect(report.resubmissionRequired).toEqual({
        operatorRequested: {
          requestedAt: REQUESTED_AT,
          requestedBy: DEFAULT_CHANGED_BY
        }
      })
    })

    it('leaves a report that changed since it was read', async () => {
      const flagged = await flaggedReport()
      await flagFrom('sl-later')
      const reflagged = await repository.findReportById(flagged.id)

      const cleared = await repository.clearClosedPeriodRestated({
        reportId: flagged.id,
        version: flagged.version
      })

      expect(cleared).toBe(false)
      expect(await repository.findReportById(flagged.id)).toEqual(reflagged)
    })

    it('returns false when the report is not flagged', async () => {
      const reportId = await createAndSubmitReport(repository)
      const report = await repository.findReportById(reportId)

      const cleared = await repository.clearClosedPeriodRestated({
        reportId,
        version: report.version
      })

      expect(cleared).toBe(false)
    })

    it('throws validation error for invalid input', async () => {
      await expect(
        repository.clearClosedPeriodRestated({ reportId: '', version: 0 })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })
  })
}
