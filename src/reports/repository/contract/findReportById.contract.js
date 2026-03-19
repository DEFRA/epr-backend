import { describe, beforeEach, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { MATERIAL, WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { buildCreateReportParams } from './test-data.js'

export const testFindReportByIdBehaviour = (it) => {
  describe('findReportById', () => {
    let repository

    beforeEach(async ({ reportsRepository }) => {
      repository = reportsRepository()
    })

    it('returns the report for a known reportId', async () => {
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Officer' }
      const reportId = await repository.createReport(
        buildCreateReportParams({ changedBy })
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
        material: MATERIAL.PLASTIC,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR
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
