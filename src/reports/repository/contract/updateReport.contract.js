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
      expect(result).toEqual({
        id: reportId,
        version: 2,
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
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        supportingInformation: 'some notes'
      })
    })

    it('increments version on every update', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )
      const changedBy = { id: 'user-2', name: 'Bob', position: 'Reviewer' }

      await repository.updateReport({
        reportId,
        version: 1,
        fields: { supportingInformation: 'first update' }
      })
      await repository.updateReport({
        reportId,
        version: 2,
        fields: { status: REPORT_STATUS.READY_TO_SUBMIT },
        changedBy
      })

      const result = await repository.findReportById(reportId)
      expect(result).toEqual({
        id: reportId,
        version: 3,
        schemaVersion: 1,
        status: REPORT_STATUS.READY_TO_SUBMIT,
        statusHistory: [
          {
            status: REPORT_STATUS.IN_PROGRESS,
            changedBy: expect.any(Object),
            changedAt: expect.any(String)
          },
          {
            status: REPORT_STATUS.READY_TO_SUBMIT,
            changedBy,
            changedAt: expect.any(String)
          }
        ],
        material: MATERIAL.PLASTIC,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        supportingInformation: 'first update'
      })
    })

    it('appends status history entry when status changes', async () => {
      const changedBy = { id: 'user-2', name: 'Bob', position: 'Reviewer' }
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      await repository.updateReport({
        reportId,
        version: 1,
        fields: { status: REPORT_STATUS.READY_TO_SUBMIT },
        changedBy
      })

      const result = await repository.findReportById(reportId)
      expect(result).toEqual({
        id: reportId,
        version: 2,
        schemaVersion: 1,
        status: REPORT_STATUS.READY_TO_SUBMIT,
        statusHistory: [
          {
            status: REPORT_STATUS.IN_PROGRESS,
            changedBy: expect.any(Object),
            changedAt: expect.any(String)
          },
          {
            status: REPORT_STATUS.READY_TO_SUBMIT,
            changedBy,
            changedAt: expect.any(String)
          }
        ],
        material: MATERIAL.PLASTIC,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR
      })
    })

    it('does not append status history when status is unchanged', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      await repository.updateReport({
        reportId,
        version: 1,
        fields: { supportingInformation: 'just a note' }
      })

      const result = await repository.findReportById(reportId)
      expect(result).toEqual({
        id: reportId,
        version: 2,
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
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        supportingInformation: 'just a note'
      })
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
