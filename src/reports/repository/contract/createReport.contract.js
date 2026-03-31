import { beforeEach, describe, expect } from 'vitest'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { MONTHLY_PERIODS } from '#reports/domain/period-labels.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import {
  buildCreateReportParams,
  DEFAULT_ORG_ID,
  DEFAULT_REG_ID,
  DEFAULT_REPORT_DUE_DATE,
  DEFAULT_REPORT_END_DATE,
  DEFAULT_REPORT_PERIOD,
  DEFAULT_REPORT_START_DATE,
  DEFAULT_REPORT_YEAR
} from './test-data.js'

export const testCreateReportBehaviour = (it) => {
  describe('createReport', () => {
    let repository

    beforeEach(async ({ reportsRepository }) => {
      repository = reportsRepository()
    })

    it('creates a report with in_progress status and correct initial fields', async () => {
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Manager' }
      const result = await repository.createReport(
        buildCreateReportParams({
          material: 'plastic',
          siteAddress: '1 Recycling Lane',
          changedBy
        })
      )

      expect(result).toEqual({
        id: expect.any(String),
        version: 1,
        schemaVersion: 1,
        submissionNumber: 1,
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID,
        year: DEFAULT_REPORT_YEAR,
        cadence: 'monthly',
        period: DEFAULT_REPORT_PERIOD,
        startDate: DEFAULT_REPORT_START_DATE,
        endDate: DEFAULT_REPORT_END_DATE,
        dueDate: DEFAULT_REPORT_DUE_DATE,
        material: 'plastic',
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        siteAddress: '1 Recycling Lane',
        status: {
          currentStatus: REPORT_STATUS.IN_PROGRESS,
          currentStatusAt: expect.any(String),
          created: { at: expect.any(String), by: changedBy },
          history: [
            {
              status: REPORT_STATUS.IN_PROGRESS,
              at: expect.any(String),
              by: changedBy
            }
          ]
        }
      })
    })

    it('throws conflict when creating duplicate report for same period and submissionNumber', async () => {
      await repository.createReport(
        buildCreateReportParams({ period: MONTHLY_PERIODS.February })
      )

      await expect(
        repository.createReport(
          buildCreateReportParams({ period: MONTHLY_PERIODS.February })
        )
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 409 } })
    })

    it('throws conflict when creating a second active draft for the same slot with a different submissionNumber', async () => {
      await repository.createReport(
        buildCreateReportParams({
          period: MONTHLY_PERIODS.February,
          submissionNumber: 1
        })
      )

      await expect(
        repository.createReport(
          buildCreateReportParams({
            period: MONTHLY_PERIODS.February,
            submissionNumber: 2
          })
        )
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 409 } })
    })

    it('allows creating multiple reports with different submissionNumber', async () => {
      const changedBy = { id: 'user-2', name: 'Bob', position: 'Reviewer' }
      const { id: firstId } = await repository.createReport(
        buildCreateReportParams({ period: MONTHLY_PERIODS.February })
      )

      await repository.updateReportStatus({
        reportId: firstId,
        version: 1,
        status: REPORT_STATUS.SUBMITTED,
        changedBy
      })

      const { id: secondId } = await repository.createReport(
        buildCreateReportParams({
          period: MONTHLY_PERIODS.February,
          submissionNumber: 2
        })
      )

      expect(secondId).not.toBe(firstId)
    })

    it('throws on invalid cadence', async () => {
      await expect(
        repository.createReport(buildCreateReportParams({ cadence: 'weekly' }))
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })

    it('throws on missing required fields', async () => {
      await expect(
        repository.createReport({ organisationId: DEFAULT_ORG_ID })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })
  })
}
