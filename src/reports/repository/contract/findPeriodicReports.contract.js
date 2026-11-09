import { beforeEach, describe, expect } from 'vitest'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { MONTHLY_PERIODS } from '#reports/domain/period-labels.js'
import {
  buildCreateReportParams,
  createAndSubmitReport,
  DEFAULT_CHANGED_BY,
  DEFAULT_ORG_NUMBER,
  DEFAULT_REG_NUMBER,
  DEFAULT_REPORT_DUE_DATE,
  DEFAULT_REPORT_END_DATE,
  DEFAULT_REPORT_PERIOD,
  DEFAULT_REPORT_START_DATE,
  DEFAULT_REPORT_YEAR,
  uniqueOrganisationNumber,
  uniqueRegistrationNumber
} from './test-data.js'

const DEFAULT_KEY = {
  organisationNumber: DEFAULT_ORG_NUMBER,
  registrationNumber: DEFAULT_REG_NUMBER
}

export const testFindPeriodicReportsBehaviour = (it) => {
  describe('findPeriodicReports', () => {
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

    it('returns empty array when no reports exist for org/reg', async () => {
      const result = await repository.findPeriodicReports(DEFAULT_KEY)

      expect(result).toEqual([])
    })

    it('does not return reports belonging to a different organisation', async () => {
      await repository.createReport(buildCreateReportParams())

      const result = await repository.findPeriodicReports({
        organisationNumber: uniqueOrganisationNumber(),
        registrationNumber: DEFAULT_REG_NUMBER
      })

      expect(result).toEqual([])
    })

    it('does not return reports belonging to a different registration', async () => {
      await repository.createReport(buildCreateReportParams())

      const result = await repository.findPeriodicReports({
        organisationNumber: DEFAULT_ORG_NUMBER,
        registrationNumber: uniqueRegistrationNumber()
      })

      expect(result).toEqual([])
    })

    it('returns the full periodic report document', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      const [result] = await repository.findPeriodicReports(DEFAULT_KEY)

      expect(result).toMatchObject({
        ...DEFAULT_KEY,
        year: DEFAULT_REPORT_YEAR,
        reports: {
          monthly: {
            [DEFAULT_REPORT_PERIOD]: {
              current: {
                id: reportId,
                status: REPORT_STATUS.IN_PROGRESS,
                submissionNumber: 1,
                submittedAt: null,
                submittedBy: null
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

      const [result] = await repository.findPeriodicReports(DEFAULT_KEY)

      expect(result).toMatchObject({
        ...DEFAULT_KEY,
        year: DEFAULT_REPORT_YEAR,
        reports: {
          monthly: {
            [MONTHLY_PERIODS.January]: {
              current: {
                id: r1,
                status: REPORT_STATUS.IN_PROGRESS,
                submissionNumber: 1,
                submittedAt: null,
                submittedBy: null
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
                submissionNumber: 1,
                submittedAt: null,
                submittedBy: null
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

      const [result] = await repository.findPeriodicReports(DEFAULT_KEY)

      expect(result).toMatchObject({
        ...DEFAULT_KEY,
        year: DEFAULT_REPORT_YEAR,
        reports: {
          monthly: {
            [MONTHLY_PERIODS.January]: {
              current: {
                id: second,
                status: REPORT_STATUS.IN_PROGRESS,
                submissionNumber: 2,
                submittedAt: null,
                submittedBy: null
              },
              previousSubmissions: [
                {
                  id: first,
                  status: REPORT_STATUS.SUBMITTED,
                  submissionNumber: 1,
                  submittedAt: expect.any(String),
                  submittedBy: DEFAULT_CHANGED_BY
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
        repository.findPeriodicReports({
          organisationNumber: DEFAULT_ORG_NUMBER
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })
  })
}
