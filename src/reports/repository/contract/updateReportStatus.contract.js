import { describe, beforeEach, expect } from 'vitest'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { buildCreateReportParams } from './test-data.js'

export const testUpdateReportStatusBehaviour = (it) => {
  describe('updateReportStatus', () => {
    let repository

    beforeEach(async ({ reportsRepository }) => {
      repository = reportsRepository()
    })

    it('transitions in_progress → ready_to_submit, sets slot and appends history', async () => {
      const changedBy = { id: 'user-2', name: 'Bob', position: 'Reviewer' }
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      await repository.updateReportStatus({
        reportId,
        version: 1,
        status: REPORT_STATUS.READY_TO_SUBMIT,
        changedBy
      })

      const result = await repository.findReportById(reportId)
      expect(result).toMatchObject({
        id: reportId,
        version: 2,
        status: {
          currentStatus: REPORT_STATUS.READY_TO_SUBMIT,
          ready: { at: expect.any(String), by: changedBy },
          history: [
            {
              status: REPORT_STATUS.IN_PROGRESS,
              at: expect.any(String),
              by: expect.any(Object)
            },
            {
              status: REPORT_STATUS.READY_TO_SUBMIT,
              at: expect.any(String),
              by: changedBy
            }
          ]
        }
      })
    })

    it('transitions ready_to_submit → submitted, sets slot and appends history', async () => {
      const changedBy = { id: 'user-3', name: 'Carol', position: 'Manager' }
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      await repository.updateReportStatus({
        reportId,
        version: 1,
        status: REPORT_STATUS.READY_TO_SUBMIT,
        changedBy
      })
      await repository.updateReportStatus({
        reportId,
        version: 2,
        status: REPORT_STATUS.SUBMITTED,
        changedBy
      })

      const result = await repository.findReportById(reportId)
      expect(result).toMatchObject({
        id: reportId,
        version: 3,
        status: {
          currentStatus: REPORT_STATUS.SUBMITTED,
          submitted: { at: expect.any(String), by: changedBy },
          history: [
            {
              status: REPORT_STATUS.IN_PROGRESS,
              at: expect.any(String),
              by: expect.any(Object)
            },
            {
              status: REPORT_STATUS.READY_TO_SUBMIT,
              at: expect.any(String),
              by: changedBy
            },
            {
              status: REPORT_STATUS.SUBMITTED,
              at: expect.any(String),
              by: changedBy
            }
          ]
        }
      })
    })

    it('increments version on status update', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      await repository.updateReportStatus({
        reportId,
        version: 1,
        status: REPORT_STATUS.READY_TO_SUBMIT
      })

      const result = await repository.findReportById(reportId)
      expect(result.version).toBe(2)
    })

    it('throws conflict when version does not match', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      await expect(
        repository.updateReportStatus({
          reportId,
          version: 99,
          status: REPORT_STATUS.READY_TO_SUBMIT
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 409 } })
    })

    it('throws error on invalid status', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      await expect(
        repository.updateReportStatus({
          reportId,
          version: 1,
          status: 'INVALID-STATUS'
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })

    it('throws notFound for unknown reportId', async () => {
      await expect(
        repository.updateReportStatus({
          reportId: 'non-existent-id',
          version: 1,
          status: REPORT_STATUS.READY_TO_SUBMIT
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 404 } })
    })
  })
}
