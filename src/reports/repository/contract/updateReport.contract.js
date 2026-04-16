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

      const result = await repository.updateReport({
        reportId,
        version: 1,
        fields: { supportingInformation: 'some notes' }
      })

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
      const result = await repository.updateReport({
        reportId,
        version: 2,
        fields: { supportingInformation: 'second update' }
      })

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

    it('updates prn fields', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams({ prn: { issuedTonnage: 100 } })
      )

      const result = await repository.updateReport({
        reportId,
        version: 1,
        fields: {
          prn: { issuedTonnage: 100, totalRevenue: 500, freeTonnage: 10 }
        }
      })

      expect(result.prn).toMatchObject({
        issuedTonnage: 100,
        totalRevenue: 500,
        freeTonnage: 10
      })
    })

    it('updates recyclingActivity fields', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      const result = await repository.updateReport({
        reportId,
        version: 1,
        fields: {
          recyclingActivity: {
            suppliers: [],
            totalTonnageReceived: 0,
            tonnageRecycled: 100.5,
            tonnageNotRecycled: 20
          }
        }
      })

      expect(result.recyclingActivity).toMatchObject({
        tonnageRecycled: 100.5,
        tonnageNotRecycled: 20
      })
    })

    it('updates exportActivity fields', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams({
          exportActivity: {
            overseasSites: [],
            unapprovedOverseasSites: [],
            totalTonnageExported: 0,
            tonnageReceivedNotExported: null,
            tonnageRefusedAtDestination: 0,
            tonnageStoppedDuringExport: 0,
            totalTonnageRefusedOrStopped: 0,
            tonnageRepatriated: 0
          }
        })
      )

      const result = await repository.updateReport({
        reportId,
        version: 1,
        fields: {
          exportActivity: { tonnageReceivedNotExported: 15.5 }
        }
      })

      expect(result.exportActivity.tonnageReceivedNotExported).toBe(15.5)
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

    describe('rejects values with more than two decimal places', () => {
      it('throws for prn.totalRevenue', async () => {
        const { id: reportId } = await repository.createReport(
          buildCreateReportParams({ prn: { issuedTonnage: 100 } })
        )

        for (const totalRevenue of [100.123, 0.001, 99.999]) {
          await expect(
            repository.updateReport({
              reportId,
              version: 1,
              fields: { prn: { totalRevenue } }
            })
          ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
        }
      })

      it('throws for recyclingActivity.tonnageRecycled', async () => {
        const { id: reportId } = await repository.createReport(
          buildCreateReportParams()
        )

        for (const tonnageRecycled of [100.123, 0.001, 99.999]) {
          await expect(
            repository.updateReport({
              reportId,
              version: 1,
              fields: { recyclingActivity: { tonnageRecycled } }
            })
          ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
        }
      })

      it('throws for recyclingActivity.tonnageNotRecycled', async () => {
        const { id: reportId } = await repository.createReport(
          buildCreateReportParams()
        )

        for (const tonnageNotRecycled of [100.123, 0.001, 99.999]) {
          await expect(
            repository.updateReport({
              reportId,
              version: 1,
              fields: { recyclingActivity: { tonnageNotRecycled } }
            })
          ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
        }
      })
    })
  })
}
