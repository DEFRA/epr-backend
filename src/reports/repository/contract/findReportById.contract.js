import { describe, beforeEach, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { MATERIAL, WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
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

export const testFindReportByIdBehaviour = (it) => {
  describe('findReportById', () => {
    let repository

    beforeEach(async ({ reportsRepository }) => {
      repository = reportsRepository()
    })

    it('returns the report for a known reportId', async () => {
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams({ changedBy })
      )

      const result = await repository.findReportById(reportId)

      expect(result).toEqual({
        id: reportId,
        version: 1,
        schemaVersion: 1,
        submissionNumber: 1,
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID,
        year: DEFAULT_REPORT_YEAR,
        cadence: 'monthly',
        period: DEFAULT_REPORT_PERIOD,
        source: {
          lastUploadedAt: expect.any(String),
          summaryLogId: expect.any(String)
        },
        prn: {
          issuedTonnage: 80,
          totalRevenue: 40000,
          averagePricePerTonne: 500,
          freeTonnage: 0
        },
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
        supportingInformation: 'Test note',
        startDate: DEFAULT_REPORT_START_DATE,
        endDate: DEFAULT_REPORT_END_DATE,
        dueDate: DEFAULT_REPORT_DUE_DATE,
        material: MATERIAL.PLASTIC,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
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

    it('throws notFound for a valid UUID that does not exist', async () => {
      await expect(
        repository.findReportById(randomUUID())
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 404 } })
    })

    it('throws badRequest for a non-UUID reportId', async () => {
      await expect(
        repository.findReportById('not-a-uuid')
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })
  })
}
