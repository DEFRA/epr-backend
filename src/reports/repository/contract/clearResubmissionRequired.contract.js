import { beforeEach, describe, expect } from 'vitest'
import {
  createAndSubmitReport,
  DEFAULT_ORG_ID,
  DEFAULT_REG_ID,
  DEFAULT_REPORT_YEAR,
  DEFAULT_REPORT_PERIOD
} from './test-data.js'

/**
 * @import { ReportsRepository } from '#reports/repository/port.js'
 */

/** @param {ReportsRepository} repository */
const flagClosedPeriodRestated = (repository) =>
  repository.markSubmittedReportsRequiringResubmission({
    organisationId: DEFAULT_ORG_ID,
    registrationId: DEFAULT_REG_ID,
    summaryLogId: 'sl-restated',
    uploadedAt: '2026-05-01T00:00:00.000Z',
    periods: [
      {
        year: DEFAULT_REPORT_YEAR,
        cadence: 'monthly',
        period: DEFAULT_REPORT_PERIOD
      }
    ]
  })

export const testClearResubmissionRequiredBehaviour = (it) => {
  describe('clearResubmissionRequired', () => {
    /** @type {ReportsRepository} */
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

    it('clears the resubmission requirement and increments the version', async () => {
      const reportId = await createAndSubmitReport(repository)
      await flagClosedPeriodRestated(repository)
      const { version } = await repository.findReportById(reportId)

      const cleared = await repository.clearResubmissionRequired({
        reportId,
        version
      })

      expect(cleared).toBe(true)
      const report = await repository.findReportById(reportId)
      expect(report.resubmissionRequired).toBeUndefined()
      expect(report.version).toBe(version + 1)
    })

    it('leaves the report unchanged when its version has moved on', async () => {
      const reportId = await createAndSubmitReport(repository)
      await flagClosedPeriodRestated(repository)
      const before = await repository.findReportById(reportId)

      const cleared = await repository.clearResubmissionRequired({
        reportId,
        version: before.version - 1
      })

      expect(cleared).toBe(false)
      expect(await repository.findReportById(reportId)).toEqual(before)
    })

    it('throws validation error for invalid input', async () => {
      await expect(
        repository.clearResubmissionRequired({ reportId: '', version: 0 })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })
  })
}
