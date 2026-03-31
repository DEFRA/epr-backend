import { describe, beforeEach, expect } from 'vitest'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { MATERIAL, WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { buildCreateReportParams } from './test-data.js'

export const testUpdateReportBehaviour = (it) => {
  describe('updateReport', () => {
    let repository

    beforeEach(async ({ reportsRepository }) => {
      repository = reportsRepository()
    })

    it('updates supportingInformation', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      await repository.updateReport({
        reportId,
        version: 1,
        fields: { supportingInformation: 'some notes' }
      })

      const result = await repository.findReportById(reportId)
      expect(result).toMatchObject({
        id: reportId,
        version: 2,
        schemaVersion: 1,
        material: MATERIAL.PLASTIC,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        supportingInformation: 'some notes',
        status: {
          currentStatus: REPORT_STATUS.IN_PROGRESS,
          history: [
            {
              status: REPORT_STATUS.IN_PROGRESS,
              at: expect.any(String),
              by: expect.any(Object)
            }
          ]
        }
      })
    })

    it('increments version on field update', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      await repository.updateReport({
        reportId,
        version: 1,
        fields: { supportingInformation: 'first update' }
      })
      await repository.updateReport({
        reportId,
        version: 2,
        fields: { supportingInformation: 'second update' }
      })

      const result = await repository.findReportById(reportId)
      expect(result).toMatchObject({ id: reportId, version: 3 })
    })

    it('throws conflict when version does not match', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      await expect(
        repository.updateReport({
          reportId,
          version: 99,
          fields: { supportingInformation: 'stale update' }
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 409 } })
    })

    it('throws when updating non-updatable fields', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      await expect(
        repository.updateReport({
          reportId,
          version: 1,
          fields: { material: 'plastic' }
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })

    it('throws notFound for unknown reportId', async () => {
      await expect(
        repository.updateReport({
          reportId: 'non-existent-id',
          version: 1,
          fields: { supportingInformation: 'note' }
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 404 } })
    })
  })
}
