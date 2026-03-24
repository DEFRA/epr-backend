import { beforeEach, describe, expect } from 'vitest'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import {
  MONTHLY_PERIODS,
  QUARTERLY_PERIODS
} from '#reports/domain/period-labels.js'
import { MATERIAL, WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import {
  buildCreateReportParams,
  DEFAULT_ORG_ID,
  DEFAULT_REG_ID,
  DEFAULT_REPORT_DUE_DATE,
  DEFAULT_REPORT_END_DATE,
  DEFAULT_REPORT_PERIOD,
  DEFAULT_REPORT_START_DATE
} from './test-data.js'

export const testCreateReportBehaviour = (it) => {
  describe('createReport', () => {
    let repository

    beforeEach(async ({ reportsRepository }) => {
      repository = reportsRepository()
    })

    it('creates a report with status in_progress and correct initial fields', async () => {
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Manager' }
      const reportId = await repository.createReport(
        buildCreateReportParams({
          material: 'plastic',
          siteAddress: '1 Recycling Lane',
          changedBy
        })
      )

      const result = await repository.findReportById(reportId)

      expect(result).toEqual({
        id: reportId,
        version: 1,
        schemaVersion: 1,
        status: REPORT_STATUS.IN_PROGRESS,
        statusHistory: [
          {
            status: REPORT_STATUS.IN_PROGRESS,
            changedBy,
            changedAt: expect.any(String)
          }
        ],
        material: 'plastic',
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        siteAddress: '1 Recycling Lane'
      })
    })

    it(`does not store organisationId, registrationId, year, cadence, period on the report `, async () => {
      const reportId = await repository.createReport(
        buildCreateReportParams({
          cadence: 'quarterly',
          period: QUARTERLY_PERIODS.Q2
        })
      )

      const result = await repository.findReportById(reportId)

      expect(result).toEqual({
        id: reportId,
        version: 1,
        schemaVersion: 1,
        status: REPORT_STATUS.IN_PROGRESS,
        statusHistory: [
          {
            status: REPORT_STATUS.IN_PROGRESS,
            changedBy: expect.any(Object),
            changedAt: expect.any(String)
          }
        ],
        material: MATERIAL.PLASTIC,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR
      })
    })

    it(`moves existing currentReportId to end of previousReportIds when re-creating for same slot)`, async () => {
      const first = await repository.createReport(
        buildCreateReportParams({ period: MONTHLY_PERIODS.February })
      )
      const second = await repository.createReport(
        buildCreateReportParams({ period: MONTHLY_PERIODS.February })
      )

      const [periodicReport] = await repository.findPeriodicReports({
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID
      })

      const result = periodicReport.reports.monthly[MONTHLY_PERIODS.February]

      expect(result).toEqual({
        currentReportId: second,
        previousReportIds: [first],
        startDate: DEFAULT_REPORT_START_DATE,
        endDate: DEFAULT_REPORT_END_DATE,
        dueDate: DEFAULT_REPORT_DUE_DATE
      })
    })

    it('increments periodic report version on each createReport', async () => {
      await repository.createReport(
        buildCreateReportParams({ period: DEFAULT_REPORT_PERIOD })
      )

      const [result] = await repository.findPeriodicReports({
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID
      })
      expect(result.version).toBe(1)

      await repository.createReport(
        buildCreateReportParams({ period: MONTHLY_PERIODS.February })
      )

      const [updatedResult] = await repository.findPeriodicReports({
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID
      })
      expect(updatedResult.version).toBe(2)
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

    it(`creates separate slots for different periods`, async () => {
      const reportId1 = await repository.createReport(
        buildCreateReportParams({ period: MONTHLY_PERIODS.March })
      )
      const reportId2 = await repository.createReport(
        buildCreateReportParams({ period: MONTHLY_PERIODS.April })
      )

      expect(reportId1).not.toBe(reportId2)
    })
  })
}
