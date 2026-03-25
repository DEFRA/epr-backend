import { describe, beforeEach, expect } from 'vitest'
import { ObjectId } from 'mongodb'
import { MONTHLY_PERIODS } from '#reports/domain/period-labels.js'
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

    it('returns the full periodic report document', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      const [result] = await repository.findPeriodicReports({
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID
      })

      expect(result).toEqual({
        version: 1,
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID,
        year: DEFAULT_REPORT_YEAR,
        reports: {
          monthly: {
            [DEFAULT_REPORT_PERIOD]: {
              currentReportId: reportId,
              previousReportIds: [],
              startDate: DEFAULT_REPORT_START_DATE,
              endDate: DEFAULT_REPORT_END_DATE,
              dueDate: DEFAULT_REPORT_DUE_DATE
            }
          }
        }
      })
    })

    it(`includes slots from multiple periods in a single document`, async () => {
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
        version: 2,
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID,
        year: DEFAULT_REPORT_YEAR,
        reports: {
          monthly: {
            [MONTHLY_PERIODS.January]: {
              currentReportId: r1,
              previousReportIds: [],
              startDate: DEFAULT_REPORT_START_DATE,
              endDate: DEFAULT_REPORT_END_DATE,
              dueDate: DEFAULT_REPORT_DUE_DATE
            },
            [MONTHLY_PERIODS.February]: {
              currentReportId: r2,
              previousReportIds: [],

              startDate: DEFAULT_REPORT_START_DATE,
              endDate: DEFAULT_REPORT_END_DATE,
              dueDate: DEFAULT_REPORT_DUE_DATE
            }
          }
        }
      })
    })

    it(`reflects previous report ids after re-creation for same slot`, async () => {
      const { id: first } = await repository.createReport(
        buildCreateReportParams({ period: MONTHLY_PERIODS.January })
      )
      const { id: second } = await repository.createReport(
        buildCreateReportParams({ period: MONTHLY_PERIODS.January })
      )

      const [result] = await repository.findPeriodicReports({
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID
      })

      expect(result).toEqual({
        version: 2,
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID,
        year: DEFAULT_REPORT_YEAR,
        reports: {
          monthly: {
            [MONTHLY_PERIODS.January]: {
              currentReportId: second,
              previousReportIds: [first],
              startDate: DEFAULT_REPORT_START_DATE,
              endDate: DEFAULT_REPORT_END_DATE,
              dueDate: DEFAULT_REPORT_DUE_DATE
            }
          }
        }
      })
    })

    it('does not return documents from a different org/reg', async () => {
      const otherOrgId = new ObjectId().toString()
      const otherRegId = new ObjectId().toString()
      await repository.createReport(
        buildCreateReportParams({
          organisationId: otherOrgId,
          registrationId: otherRegId
        })
      )

      const result = await repository.findPeriodicReports({
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID
      })

      expect(result).toEqual([])
    })

    it('throws on missing required params', async () => {
      await expect(
        repository.findPeriodicReports({ organisationId: DEFAULT_ORG_ID })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })
  })
}
