import { beforeEach, describe, expect } from 'vitest'
import { MONTHLY_PERIODS } from '#reports/domain/period-labels.js'
import {
  buildCreateReportParams,
  DEFAULT_ORG_NUMBER,
  DEFAULT_REG_NUMBER,
  DEFAULT_REPORT_PERIOD,
  DEFAULT_REPORT_YEAR
} from './test-data.js'

const buildDeleteParams = (overrides = {}) => ({
  organisationNumber: DEFAULT_ORG_NUMBER,
  registrationNumber: DEFAULT_REG_NUMBER,
  year: DEFAULT_REPORT_YEAR,
  cadence: 'monthly',
  period: DEFAULT_REPORT_PERIOD,
  changedBy: { id: 'user-3', name: 'Carol', position: 'Admin' },
  ...overrides
})

export const testDeleteReportBehaviour = (it) => {
  describe('deleteReport', () => {
    let repository

    beforeEach(
      async (
        /** @type {{ reportsRepository: import('../port.js').ReportsRepositoryFactory }} */ {
          reportsRepository
        }
      ) => {
        repository = reportsRepository()
      }
    )

    it('hard-deletes the report so findReportById throws 404', async () => {
      const { id: reportId, submissionNumber } = await repository.createReport(
        buildCreateReportParams({
          cadence: 'monthly',
          period: DEFAULT_REPORT_PERIOD
        })
      )

      await repository.deleteReport(buildDeleteParams({ submissionNumber }))

      await expect(repository.findReportById(reportId)).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
      })
    })

    it('removes the slot from findPeriodicReports after delete', async () => {
      const { submissionNumber } = await repository.createReport(
        buildCreateReportParams({
          cadence: 'monthly',
          period: DEFAULT_REPORT_PERIOD
        })
      )

      await repository.deleteReport(buildDeleteParams({ submissionNumber }))

      const result = await repository.findPeriodicReports({
        organisationNumber: DEFAULT_ORG_NUMBER,
        registrationNumber: DEFAULT_REG_NUMBER
      })
      expect(result).toEqual([])
    })

    it('throws notFound on second delete', async () => {
      const { submissionNumber } = await repository.createReport(
        buildCreateReportParams({
          cadence: 'monthly',
          period: DEFAULT_REPORT_PERIOD
        })
      )

      await repository.deleteReport(buildDeleteParams({ submissionNumber }))

      await expect(
        repository.deleteReport(buildDeleteParams({ submissionNumber }))
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 404 } })
    })

    it('throws notFound when no report exists for the given period', async () => {
      await expect(
        repository.deleteReport(
          buildDeleteParams({ period: MONTHLY_PERIODS.December })
        )
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 404 } })
    })

    it('throws notFound for the same slot under another registration number', async () => {
      const { submissionNumber } = await repository.createReport(
        buildCreateReportParams({
          cadence: 'monthly',
          period: DEFAULT_REPORT_PERIOD
        })
      )

      await expect(
        repository.deleteReport(
          buildDeleteParams({
            submissionNumber,
            registrationNumber: 'R25SR500099999PL'
          })
        )
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 404 } })
    })

    it('throws notFound when submissionNumber does not match', async () => {
      await repository.createReport(
        buildCreateReportParams({
          cadence: 'monthly',
          period: DEFAULT_REPORT_PERIOD
        })
      )

      await expect(
        repository.deleteReport(buildDeleteParams({ submissionNumber: 999 }))
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 404 } })
    })

    it('throws badRequest on missing required params', async () => {
      await expect(
        repository.deleteReport({ organisationNumber: DEFAULT_ORG_NUMBER })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })
  })
}
