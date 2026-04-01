import { beforeEach, describe, expect } from 'vitest'
import { ObjectId } from 'mongodb'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { MONTHLY_PERIODS } from '#reports/domain/period-labels.js'
import {
  buildCreateReportParams,
  createAndSubmitReport,
  DEFAULT_ORG_ID,
  DEFAULT_REG_ID,
  DEFAULT_REPORT_DUE_DATE,
  DEFAULT_REPORT_END_DATE,
  DEFAULT_REPORT_PERIOD,
  DEFAULT_REPORT_START_DATE,
  DEFAULT_REPORT_YEAR
} from './test-data.js'

export const testFindPeriodicReportsBehaviour = (it) => {
  describe('findPeriodicReports', () => {
    let repository

    beforeEach(async ({ reportsRepository }) => {
      repository = reportsRepository()
    })

    it('returns empty array when no reports exist for org/reg', async () => {
      const result = await repository.findPeriodicReports({
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID
      })

      expect(result).toEqual([])
    })

    it('does not return reports belonging to a different organisation', async () => {
      await repository.createReport(buildCreateReportParams())

      const result = await repository.findPeriodicReports({
        organisationId: new ObjectId().toString(),
        registrationId: DEFAULT_REG_ID
      })

      expect(result).toEqual([])
    })

    it('does not return reports belonging to a different registration', async () => {
      await repository.createReport(buildCreateReportParams())

      const result = await repository.findPeriodicReports({
        organisationId: DEFAULT_ORG_ID,
        registrationId: new ObjectId().toString()
      })

      expect(result).toEqual([])
    })

    it('returns the full periodic report document', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      const [result] = await repository.findPeriodicReports({
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID
      })

      expect(result).toEqual({
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID,
        year: DEFAULT_REPORT_YEAR,
        reports: {
          monthly: {
            [DEFAULT_REPORT_PERIOD]: {
              current: {
                id: reportId,
                status: REPORT_STATUS.IN_PROGRESS,
                submissionNumber: 1
              },
              previousSubmissions: [],
              startDate: DEFAULT_REPORT_START_DATE,
              endDate: DEFAULT_REPORT_END_DATE,
              dueDate: DEFAULT_REPORT_DUE_DATE
            }
          }
        }
      })
    })

    it('includes slots from multiple periods in a single document', async () => {
      const { id: r1 } = await repository.createReport(
        buildCreateReportParams({ period: MONTHLY_PERIODS.January })
      )
      const { id: r2 } = await repository.createReport(
        buildCreateReportParams({ period: MONTHLY_PERIODS.February })
      )

      const [result] = await repository.findPeriodicReports({
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID
      })

      expect(result).toEqual({
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID,
        year: DEFAULT_REPORT_YEAR,
        reports: {
          monthly: {
            [MONTHLY_PERIODS.January]: {
              current: {
                id: r1,
                status: REPORT_STATUS.IN_PROGRESS,
                submissionNumber: 1
              },
              previousSubmissions: [],
              startDate: DEFAULT_REPORT_START_DATE,
              endDate: DEFAULT_REPORT_END_DATE,
              dueDate: DEFAULT_REPORT_DUE_DATE
            },
            [MONTHLY_PERIODS.February]: {
              current: {
                id: r2,
                status: REPORT_STATUS.IN_PROGRESS,
                submissionNumber: 1
              },
              previousSubmissions: [],
              startDate: DEFAULT_REPORT_START_DATE,
              endDate: DEFAULT_REPORT_END_DATE,
              dueDate: DEFAULT_REPORT_DUE_DATE
            }
          }
        }
      })
    })

    it('reflects previousSubmissions when multiple reports are created with different submissionNumbers', async () => {
      const first = await createAndSubmitReport(repository, {
        period: MONTHLY_PERIODS.January
      })

      const { id: second } = await repository.createReport(
        buildCreateReportParams({
          period: MONTHLY_PERIODS.January,
          submissionNumber: 2
        })
      )

      const [result] = await repository.findPeriodicReports({
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID
      })

      expect(result).toEqual({
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID,
        year: DEFAULT_REPORT_YEAR,
        reports: {
          monthly: {
            [MONTHLY_PERIODS.January]: {
              current: {
                id: second,
                status: REPORT_STATUS.IN_PROGRESS,
                submissionNumber: 2
              },
              previousSubmissions: [
                {
                  id: first,
                  status: REPORT_STATUS.SUBMITTED,
                  submissionNumber: 1
                }
              ],
              startDate: DEFAULT_REPORT_START_DATE,
              endDate: DEFAULT_REPORT_END_DATE,
              dueDate: DEFAULT_REPORT_DUE_DATE
            }
          }
        }
      })
    })

    it('throws on missing required params', async () => {
      await expect(
        repository.findPeriodicReports({ organisationId: DEFAULT_ORG_ID })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })
  })
}
