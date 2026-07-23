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

const REQUESTED_AT = '2026-06-01T12:00:00.000Z'

const DEFAULT_PARAMS = {
  organisationId: DEFAULT_ORG_ID,
  registrationId: DEFAULT_REG_ID,
  year: DEFAULT_REPORT_YEAR,
  cadence: 'monthly',
  period: DEFAULT_REPORT_PERIOD,
  submissionNumber: 1,
  requestedBy: DEFAULT_CHANGED_BY,
  requestedAt: REQUESTED_AT
}

export const testMarkSubmittedReportRequiringResubmissionByOperatorBehaviour = (
  it
) => {
  describe('markSubmittedReportRequiringResubmissionByOperator', () => {
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

    it('flags the submitted report and returns the result', async () => {
      const reportId = await createAndSubmitReport(repository)

      const result =
        await repository.markSubmittedReportRequiringResubmissionByOperator(
          DEFAULT_PARAMS
        )

      expect(result).toEqual({
        reportId,
        year: DEFAULT_REPORT_YEAR,
        cadence: 'monthly',
        period: DEFAULT_REPORT_PERIOD,
        submissionNumber: 1,
        resubmissionRequired: {
          operatorRequested: {
            requestedAt: REQUESTED_AT,
            requestedBy: DEFAULT_CHANGED_BY
          }
        }
      })

      const report = await repository.findReportById(reportId)
      expect(report.resubmissionRequired).toEqual({
        operatorRequested: {
          requestedAt: REQUESTED_AT,
          requestedBy: DEFAULT_CHANGED_BY
        }
      })
    })

    it('returns null on a second call — already flagged', async () => {
      await createAndSubmitReport(repository)

      const first =
        await repository.markSubmittedReportRequiringResubmissionByOperator(
          DEFAULT_PARAMS
        )
      expect(first).not.toBeNull()

      const second =
        await repository.markSubmittedReportRequiringResubmissionByOperator(
          DEFAULT_PARAMS
        )
      expect(second).toBeNull()
    })

    it('returns null when the report is not submitted', async () => {
      await repository.createReport(buildCreateReportParams())

      const result =
        await repository.markSubmittedReportRequiringResubmissionByOperator(
          DEFAULT_PARAMS
        )

      expect(result).toBeNull()
    })

    it('returns null when no report exists at the given submissionNumber', async () => {
      const result =
        await repository.markSubmittedReportRequiringResubmissionByOperator(
          DEFAULT_PARAMS
        )

      expect(result).toBeNull()
    })

    it('does not clobber an existing resubmissionRequired.closedPeriodRestated flag', async () => {
      const reportId = await createAndSubmitReport(repository)
      await repository.markSubmittedReportsRequiringResubmission({
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

      await repository.markSubmittedReportRequiringResubmissionByOperator(
        DEFAULT_PARAMS
      )

      const report = await repository.findReportById(reportId)
      expect(report.resubmissionRequired).toEqual({
        closedPeriodRestated: {
          uploadedAt: '2026-05-01T00:00:00.000Z',
          summaryLogId: 'sl-restated'
        },
        operatorRequested: {
          requestedAt: REQUESTED_AT,
          requestedBy: DEFAULT_CHANGED_BY
        }
      })
    })

    it('throws validation error for invalid input', async () => {
      await expect(
        repository.markSubmittedReportRequiringResubmissionByOperator({
          organisationId: '',
          registrationId: '',
          year: DEFAULT_REPORT_YEAR,
          cadence: 'monthly',
          period: DEFAULT_REPORT_PERIOD,
          submissionNumber: 1,
          requestedBy: DEFAULT_CHANGED_BY,
          requestedAt: ''
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })
  })
}
