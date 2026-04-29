import { beforeEach, describe, expect } from 'vitest'
import { ObjectId } from 'mongodb'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { MONTHLY_PERIODS } from '#reports/domain/period-labels.js'
import {
  buildCreateReportParams,
  createAndSubmitReport,
  DEFAULT_CHANGED_BY,
  DEFAULT_ORG_ID,
  DEFAULT_REG_ID,
  DEFAULT_REPORT_DUE_DATE,
  DEFAULT_REPORT_END_DATE,
  DEFAULT_REPORT_PERIOD,
  DEFAULT_REPORT_START_DATE,
  DEFAULT_REPORT_YEAR
} from './test-data.js'

const ALT_ORG_ID = new ObjectId().toString()
const ALT_REG_ID = new ObjectId().toString()

export const testFindAllPeriodicReportsBehaviour = (it) => {
  describe('findAllPeriodicReports', () => {
    let repository

    beforeEach(async ({ reportsRepository }) => {
      repository = reportsRepository()
    })

    it('returns empty array when no reports exist', async () => {
      const result = await repository.findAllPeriodicReports()

      expect(result).toEqual([])
    })

    it('returns the periodic report document for a single org/registration', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      const [result] = await repository.findAllPeriodicReports()

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
                submissionNumber: 1,
                submittedAt: null,
                submittedBy: null,
                recyclingActivity: {
                  totalTonnageReceived: 0,
                  tonnageRecycled: null,
                  tonnageNotRecycled: null
                },
                exportActivity: undefined,
                wasteSent: {
                  tonnageSentToReprocessor: 0,
                  tonnageSentToExporter: 0,
                  tonnageSentToAnotherSite: 0
                },
                prn: undefined,
                supportingInformation: undefined
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

    it('returns reports across multiple org/registration pairs', async () => {
      await repository.createReport(buildCreateReportParams())
      await repository.createReport(
        buildCreateReportParams({
          organisationId: ALT_ORG_ID,
          registrationId: ALT_REG_ID
        })
      )

      const result = await repository.findAllPeriodicReports()

      expect(result).toHaveLength(2)
      expect(result.map((r) => r.organisationId)).toEqual(
        expect.arrayContaining([DEFAULT_ORG_ID, ALT_ORG_ID])
      )
    })

    it('moves submitted report to previousSubmissions and embeds submittedAt/submittedBy', async () => {
      const submittedId = await createAndSubmitReport(repository, {
        period: MONTHLY_PERIODS.January
      })
      const { id: newId } = await repository.createReport(
        buildCreateReportParams({
          period: MONTHLY_PERIODS.January,
          submissionNumber: 2
        })
      )

      const [result] = await repository.findAllPeriodicReports()
      const slot = result.reports.monthly[MONTHLY_PERIODS.January]

      expect(slot.current).toStrictEqual({
        id: newId,
        status: REPORT_STATUS.IN_PROGRESS,
        submissionNumber: 2,
        submittedAt: null,
        submittedBy: null,
        recyclingActivity: {
          totalTonnageReceived: 0,
          tonnageRecycled: null,
          tonnageNotRecycled: null
        },
        exportActivity: undefined,
        wasteSent: {
          tonnageSentToReprocessor: 0,
          tonnageSentToExporter: 0,
          tonnageSentToAnotherSite: 0
        },
        prn: undefined,
        supportingInformation: undefined
      })
      expect(slot.previousSubmissions).toStrictEqual([
        {
          id: submittedId,
          status: REPORT_STATUS.SUBMITTED,
          submissionNumber: 1,
          submittedAt: expect.any(String),
          submittedBy: DEFAULT_CHANGED_BY,
          recyclingActivity: {
            totalTonnageReceived: 0,
            tonnageRecycled: null,
            tonnageNotRecycled: null
          },
          exportActivity: undefined,
          wasteSent: {
            tonnageSentToReprocessor: 0,
            tonnageSentToExporter: 0,
            tonnageSentToAnotherSite: 0
          },
          prn: undefined,
          supportingInformation: undefined
        }
      ])
    })

    it('groups multiple periods for the same org/registration into one document', async () => {
      await repository.createReport(
        buildCreateReportParams({ period: MONTHLY_PERIODS.January })
      )
      await repository.createReport(
        buildCreateReportParams({ period: MONTHLY_PERIODS.February })
      )

      const [doc] = await repository.findAllPeriodicReports()

      expect(Object.keys(doc.reports.monthly)).toEqual(
        expect.arrayContaining([
          String(MONTHLY_PERIODS.January),
          String(MONTHLY_PERIODS.February)
        ])
      )
    })

    it('returns separate documents for the same org/registration across different years', async () => {
      const NEXT_YEAR = DEFAULT_REPORT_YEAR + 1

      await repository.createReport(
        buildCreateReportParams({ period: MONTHLY_PERIODS.January })
      )
      await repository.createReport(
        buildCreateReportParams({
          period: MONTHLY_PERIODS.January,
          year: NEXT_YEAR,
          startDate: `${NEXT_YEAR}-01-01T00:00:00.000Z`,
          endDate: `${NEXT_YEAR}-01-31T00:00:00.000Z`,
          dueDate: `${NEXT_YEAR}-02-15T00:00:00.000Z`
        })
      )

      const result = await repository.findAllPeriodicReports()

      expect(result).toHaveLength(2)
      expect(result.map((r) => r.year)).toEqual(
        expect.arrayContaining([DEFAULT_REPORT_YEAR, NEXT_YEAR])
      )
      result.forEach((doc) => {
        expect(doc.organisationId).toBe(DEFAULT_ORG_ID)
        expect(doc.registrationId).toBe(DEFAULT_REG_ID)
        expect(Object.keys(doc.reports.monthly)).toContain(
          String(MONTHLY_PERIODS.January)
        )
      })
    })
  })
}
