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

const expectedResubmission = {
  closedPeriodRestated: {
    uploadedAt: UPLOADED_AT,
    summaryLogId: SL_ID
  }
}

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

    const callMark = (overrides = {}) =>
      repository.markSubmittedReportsRequiringResubmission({
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID,
        summaryLogId: SL_ID,
        uploadedAt: UPLOADED_AT,
        periods: [period(MONTHLY_PERIODS.January)],
        ...overrides
      })

    it('flags the latest submitted report for an affected period', async () => {
      const reportId = await createAndSubmitReport(repository)

      const flagged = await callMark()

      expect(flagged).toHaveLength(1)
      expect(flagged[0]).toMatchObject({
        reportId,
        year: DEFAULT_REPORT_YEAR,
        cadence: 'monthly',
        period: MONTHLY_PERIODS.January,
        submissionNumber: 1,
        resubmissionRequired: expectedResubmission
      })

      const report = await repository.findReportById(reportId)
      expect(report.resubmissionRequired).toEqual(expectedResubmission)
    })

    it('does not touch submitted reports in periods that were not listed', async () => {
      await createAndSubmitReport(repository, {
        period: MONTHLY_PERIODS.January
      })
      const februaryId = await createAndSubmitReport(repository, {
        period: MONTHLY_PERIODS.February
      })

      const flagged = await callMark()

      expect(flagged.map((r) => r.period)).toEqual([MONTHLY_PERIODS.January])

      const february = await repository.findReportById(februaryId)
      expect(february.resubmissionRequired).toBeUndefined()
    })

    it('flags only the latest submission within a period', async () => {
      await createAndSubmitReport(repository, { submissionNumber: 1 })
      const latestId = await createAndSubmitReport(repository, {
        submissionNumber: 2
      })

      const flagged = await callMark()

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

      const flagged = await callMark()

      expect(flagged).toEqual([])

      const report = await repository.findReportById(activeId)
      expect(report.resubmissionRequired).toBeUndefined()
    })

    it('is idempotent - second call with same summaryLogId returns []', async () => {
      await createAndSubmitReport(repository)

      const first = await callMark()
      expect(first).toHaveLength(1)

      const second = await callMark()
      expect(second).toEqual([])
    })

    it('returns [] when no submitted reports exist in the given periods', async () => {
      const flagged = await callMark()

      expect(flagged).toEqual([])
    })

    it('returns [] when no periods are given', async () => {
      await createAndSubmitReport(repository)

      const flagged = await callMark({ periods: [] })

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
