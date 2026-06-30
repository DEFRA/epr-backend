import { RESUBMISSION_REASON } from '#reports/domain/resubmission.js'
import { MONTHLY_PERIODS } from '#root/reports/domain/period-labels.js'
import { beforeEach, describe, expect } from 'vitest'
import {
  buildCreateReportParams,
  createAndSubmitReport,
  DEFAULT_ORG_ID,
  DEFAULT_REG_ID,
  DEFAULT_REPORT_YEAR
} from './test-data.js'

/**
 * @import { ReportsRepository } from '#reports/repository/port.js'
 */

const SL_ID = 'sl-id-new-000000000000000000000002'
const UPLOADED_AT = '2026-06-01T12:00:00.000Z'

const period = (period, overrides = {}) => ({
  year: DEFAULT_REPORT_YEAR,
  cadence: 'monthly',
  period,
  ...overrides
})

export const testMarkSubmittedReportsRequiringResubmissionBehaviour = (it) => {
  describe('markSubmittedReportsRequiringResubmission', () => {
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

    it('flags the latest submitted report for an affected period', async () => {
      const reportId = await createAndSubmitReport(repository)

      const flagged =
        await repository.markSubmittedReportsRequiringResubmission({
          organisationId: DEFAULT_ORG_ID,
          registrationId: DEFAULT_REG_ID,
          summaryLogId: SL_ID,
          uploadedAt: UPLOADED_AT,
          periods: [period(MONTHLY_PERIODS.January)]
        })

      expect(flagged).toHaveLength(1)
      expect(flagged[0]).toMatchObject({
        reportId,
        year: DEFAULT_REPORT_YEAR,
        cadence: 'monthly',
        period: MONTHLY_PERIODS.January,
        submissionNumber: 1,
        resubmissionRequired: {
          uploadedAt: UPLOADED_AT,
          reason: RESUBMISSION_REASON.CLOSED_PERIOD_RESTATED,
          summaryLogId: SL_ID
        }
      })

      const report = await repository.findReportById(reportId)
      expect(report.resubmissionRequired).toEqual({
        uploadedAt: UPLOADED_AT,
        reason: RESUBMISSION_REASON.CLOSED_PERIOD_RESTATED,
        summaryLogId: SL_ID
      })
    })

    it('does not touch submitted reports in periods that were not listed', async () => {
      await createAndSubmitReport(repository, {
        period: MONTHLY_PERIODS.January
      })
      const februaryId = await createAndSubmitReport(repository, {
        period: MONTHLY_PERIODS.February
      })

      const flagged =
        await repository.markSubmittedReportsRequiringResubmission({
          organisationId: DEFAULT_ORG_ID,
          registrationId: DEFAULT_REG_ID,
          summaryLogId: SL_ID,
          uploadedAt: UPLOADED_AT,
          periods: [period(MONTHLY_PERIODS.January)]
        })

      expect(flagged.map((r) => r.period)).toEqual([MONTHLY_PERIODS.January])

      const february = await repository.findReportById(februaryId)
      expect(february.resubmissionRequired).toBeUndefined()
    })

    it('flags only the latest submission within a period', async () => {
      await createAndSubmitReport(repository, { submissionNumber: 1 })
      const latestId = await createAndSubmitReport(repository, {
        submissionNumber: 2
      })

      const flagged =
        await repository.markSubmittedReportsRequiringResubmission({
          organisationId: DEFAULT_ORG_ID,
          registrationId: DEFAULT_REG_ID,
          summaryLogId: SL_ID,
          uploadedAt: UPLOADED_AT,
          periods: [period(MONTHLY_PERIODS.January)]
        })

      expect(flagged).toHaveLength(1)
      expect(flagged[0]).toMatchObject({
        reportId: latestId,
        submissionNumber: 2
      })
    })

    it('does not touch active (non-submitted) reports', async () => {
      const { id: activeId } = await repository.createReport(
        buildCreateReportParams()
      )

      const flagged =
        await repository.markSubmittedReportsRequiringResubmission({
          organisationId: DEFAULT_ORG_ID,
          registrationId: DEFAULT_REG_ID,
          summaryLogId: SL_ID,
          uploadedAt: UPLOADED_AT,
          periods: [period(MONTHLY_PERIODS.January)]
        })

      expect(flagged).toEqual([])

      const report = await repository.findReportById(activeId)
      expect(report.resubmissionRequired).toBeUndefined()
    })

    it('is idempotent - second call with same summaryLogId returns []', async () => {
      await createAndSubmitReport(repository)

      const first = await repository.markSubmittedReportsRequiringResubmission({
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID,
        summaryLogId: SL_ID,
        uploadedAt: UPLOADED_AT,
        periods: [period(MONTHLY_PERIODS.January)]
      })
      expect(first).toHaveLength(1)

      const second = await repository.markSubmittedReportsRequiringResubmission(
        {
          organisationId: DEFAULT_ORG_ID,
          registrationId: DEFAULT_REG_ID,
          summaryLogId: SL_ID,
          uploadedAt: UPLOADED_AT,
          periods: [period(MONTHLY_PERIODS.January)]
        }
      )
      expect(second).toEqual([])
    })

    it('skips reports whose source.summaryLogId matches the given summaryLogId', async () => {
      // The report was itself produced from 'sl-1' (test-data.js default source)
      await createAndSubmitReport(repository, {
        source: { summaryLogId: 'sl-1', lastUploadedAt: UPLOADED_AT }
      })

      const flagged =
        await repository.markSubmittedReportsRequiringResubmission({
          organisationId: DEFAULT_ORG_ID,
          registrationId: DEFAULT_REG_ID,
          summaryLogId: 'sl-1',
          uploadedAt: UPLOADED_AT,
          periods: [period(MONTHLY_PERIODS.January)]
        })

      expect(flagged).toEqual([])
    })

    it('returns [] when no submitted reports exist in the given periods', async () => {
      const flagged =
        await repository.markSubmittedReportsRequiringResubmission({
          organisationId: DEFAULT_ORG_ID,
          registrationId: DEFAULT_REG_ID,
          summaryLogId: SL_ID,
          uploadedAt: UPLOADED_AT,
          periods: [period(MONTHLY_PERIODS.January)]
        })

      expect(flagged).toEqual([])
    })

    it('returns [] when no periods are given', async () => {
      await createAndSubmitReport(repository)

      const flagged =
        await repository.markSubmittedReportsRequiringResubmission({
          organisationId: DEFAULT_ORG_ID,
          registrationId: DEFAULT_REG_ID,
          summaryLogId: SL_ID,
          uploadedAt: UPLOADED_AT,
          periods: []
        })

      expect(flagged).toEqual([])
    })

    it('throws validation error for invalid input', async () => {
      await expect(
        repository.markSubmittedReportsRequiringResubmission({
          organisationId: '',
          registrationId: '',
          summaryLogId: '',
          uploadedAt: '',
          periods: []
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })
  })
}
