import { describe, beforeEach, expect } from 'vitest'
import { MONTHLY } from '#reports/domain/cadence.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import {
  MONTHLY_PERIODS,
  MONTHLY_PERIOD_LABELS
} from '#reports/domain/period-labels.js'
import { MATERIAL, WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import {
  buildCreateReportParams,
  DEFAULT_ORG_ID,
  DEFAULT_REG_ID,
  DEFAULT_REPORT_YEAR,
  DEFAULT_REPORT_PERIOD,
  DEFAULT_REPORT_START_DATE,
  DEFAULT_REPORT_END_DATE,
  DEFAULT_REPORT_DUE_DATE
} from './test-data.js'

const buildDeleteParams = (overrides = {}) => ({
  organisationId: DEFAULT_ORG_ID,
  registrationId: DEFAULT_REG_ID,
  year: DEFAULT_REPORT_YEAR,
  cadence: MONTHLY.id,
  period: DEFAULT_REPORT_PERIOD,
  changedBy: { id: 'user-3', name: 'Carol', position: 'Admin' },
  ...overrides
})

export const testDeleteReportBehaviour = (it) => {
  describe('deleteReport', () => {
    let repository

    beforeEach(async ({ reportsRepository }) => {
      repository = reportsRepository()
    })

    it('deletes when report exists', async () => {
      const changedBy = buildDeleteParams().changedBy
      const reportId = await repository.createReport(
        buildCreateReportParams({
          cadence: MONTHLY.id,
          period: DEFAULT_REPORT_PERIOD
        })
      )

      await repository.deleteReport(buildDeleteParams())

      const result = await repository.findReportById(reportId)
      expect(result).toEqual({
        id: reportId,
        version: 2,
        schemaVersion: 1,
        status: REPORT_STATUS.DELETED,
        statusHistory: [
          {
            status: REPORT_STATUS.IN_PROGRESS,
            changedBy: expect.any(Object),
            changedAt: expect.any(String)
          },
          {
            status: REPORT_STATUS.DELETED,
            changedBy,
            changedAt: expect.any(String)
          }
        ],
        material: MATERIAL.PLASTIC,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR
      })

      const [periodicReport] = await repository.findPeriodicReports({
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID
      })
      const slot = periodicReport.reports[MONTHLY.id][DEFAULT_REPORT_PERIOD]
      expect(slot).toEqual({
        currentReportId: null,
        previousReportIds: [reportId],
        startDate: DEFAULT_REPORT_START_DATE,
        endDate: DEFAULT_REPORT_END_DATE,
        dueDate: DEFAULT_REPORT_DUE_DATE
      })
    })

    it('throws notFound on second delete', async () => {
      await repository.createReport(
        buildCreateReportParams({
          cadence: MONTHLY.id,
          period: DEFAULT_REPORT_PERIOD
        })
      )

      await repository.deleteReport(buildDeleteParams())

      await expect(
        repository.deleteReport(buildDeleteParams())
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 404 } })
    })

    it('throws not found when non existing report', async () => {
      await repository.createReport(
        buildCreateReportParams({
          cadence: MONTHLY.id,
          period: DEFAULT_REPORT_PERIOD
        })
      )

      await repository.deleteReport(buildDeleteParams())

      await expect(
        repository.deleteReport(buildDeleteParams())
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 404 } })
    })

    it(`throws notFound when no current report for given period (${MONTHLY_PERIOD_LABELS[12]})`, async () => {
      await expect(
        repository.deleteReport(
          buildDeleteParams({ period: MONTHLY_PERIODS.December })
        )
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 404 } })
    })

    it('throws badRequest on missing required params', async () => {
      await expect(
        repository.deleteReport({ organisationId: DEFAULT_ORG_ID })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })
  })
}
