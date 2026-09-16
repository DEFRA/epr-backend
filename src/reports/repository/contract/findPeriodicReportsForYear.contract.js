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
const NEXT_YEAR = DEFAULT_REPORT_YEAR + 1

const TONNAGE_OVERRIDES = {
  recyclingActivity: {
    suppliers: [],
    totalTonnageReceived: 120,
    tonnageRecycled: 95.5,
    tonnageNotRecycled: 24.5
  },
  exportActivity: {
    overseasSites: [],
    unapprovedOverseasSites: [],
    totalTonnageExported: 40,
    tonnageReceivedNotExported: 8,
    tonnageRefusedAtDestination: 1.5,
    tonnageStoppedDuringExport: 2,
    totalTonnageRefusedOrStopped: 3.5,
    tonnageRepatriated: 0.5
  },
  wasteSent: {
    tonnageSentToReprocessor: 50,
    tonnageSentToExporter: 20,
    tonnageSentToAnotherSite: 10,
    finalDestinations: []
  },
  prn: {
    issuedTonnage: 80,
    totalRevenue: 40000,
    averagePricePerTonne: 500,
    freeTonnage: 0
  },
  supportingInformation: 'Test note'
}

const nextYearReport = (overrides = {}) =>
  buildCreateReportParams({
    year: NEXT_YEAR,
    startDate: `${NEXT_YEAR}-01-01`,
    endDate: `${NEXT_YEAR}-01-31`,
    dueDate: `${NEXT_YEAR}-02-15`,
    ...overrides
  })

export const testFindPeriodicReportsForYearBehaviour = (it) => {
  describe('findPeriodicReportsForYear', () => {
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

    it('returns empty array when no reports exist for the year', async () => {
      await repository.createReport(nextYearReport())

      const result = await repository.findPeriodicReportsForYear({
        year: DEFAULT_REPORT_YEAR
      })

      expect(result).toEqual([])
    })

    it('returns the periodic report document with the report summary embedded', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams(TONNAGE_OVERRIDES)
      )

      const [result] = await repository.findPeriodicReportsForYear({
        year: DEFAULT_REPORT_YEAR
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
                submissionNumber: 1,
                submittedAt: null,
                submittedBy: null,
                resubmissionRequired: null,
                recyclingActivity: {
                  totalTonnageReceived: 120,
                  tonnageRecycled: 95.5,
                  tonnageNotRecycled: 24.5
                },
                exportActivity: {
                  totalTonnageExported: 40,
                  tonnageReceivedNotExported: 8,
                  tonnageRefusedAtDestination: 1.5,
                  tonnageStoppedDuringExport: 2,
                  tonnageRepatriated: 0.5
                },
                wasteSent: {
                  tonnageSentToReprocessor: 50,
                  tonnageSentToExporter: 20,
                  tonnageSentToAnotherSite: 10
                },
                prn: {
                  issuedTonnage: 80,
                  freeTonnage: 0,
                  totalRevenue: 40000,
                  averagePricePerTonne: 500
                },
                supportingInformation: 'Test note'
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

    it('returns every org/registration reporting in the year and none from another year', async () => {
      await repository.createReport(buildCreateReportParams())
      await repository.createReport(
        buildCreateReportParams({
          organisationId: ALT_ORG_ID,
          registrationId: ALT_REG_ID
        })
      )
      await repository.createReport(nextYearReport())

      const result = await repository.findPeriodicReportsForYear({
        year: DEFAULT_REPORT_YEAR
      })

      expect(result).toHaveLength(2)
      expect(result.map((r) => r.organisationId)).toEqual(
        expect.arrayContaining([DEFAULT_ORG_ID, ALT_ORG_ID])
      )
      expect(result.every((r) => r.year === DEFAULT_REPORT_YEAR)).toBe(true)
    })

    it('groups every submission of a period, with submittedAt/submittedBy on the submitted ones', async () => {
      const submittedId = await createAndSubmitReport(repository, {
        period: MONTHLY_PERIODS.January
      })
      const { id: newId } = await repository.createReport(
        buildCreateReportParams({
          period: MONTHLY_PERIODS.January,
          submissionNumber: 2
        })
      )

      const [result] = await repository.findPeriodicReportsForYear({
        year: DEFAULT_REPORT_YEAR
      })
      const slot = result.reports.monthly[MONTHLY_PERIODS.January]

      expect(slot.current).toMatchObject({
        id: newId,
        status: REPORT_STATUS.IN_PROGRESS,
        submissionNumber: 2,
        submittedAt: null,
        submittedBy: null
      })
      expect(slot.previousSubmissions).toMatchObject([
        {
          id: submittedId,
          status: REPORT_STATUS.SUBMITTED,
          submissionNumber: 1,
          submittedAt: expect.any(String),
          submittedBy: DEFAULT_CHANGED_BY
        }
      ])
    })

    it('rejects a year outside the reporting range', async () => {
      await expect(
        repository.findPeriodicReportsForYear({ year: 1999 })
      ).rejects.toThrow(/year/)
    })
  })
}
