import {
  REPORT_STATUS,
  REPORT_STATUS_SLOT
} from '#reports/domain/report-status.js'
import { beforeEach, describe, expect } from 'vitest'
import { buildCreateReportParams, createAndSubmitReport } from './test-data.js'

/** @import { ReportsRepositoryFactory } from '../port.js' */

/** @typedef {{ reportsRepository: ReportsRepositoryFactory }} ReportsFixture */

export const testUpdateReportStatusBehaviour = (it) => {
  describe('updateReportStatus', () => {
    let repository

    const changedBy = { id: 'user-2', name: 'Bob', position: 'Reviewer' }

    beforeEach(
      /** @param {ReportsFixture} fixture */ async ({ reportsRepository }) => {
        repository = reportsRepository()
      }
    )

    it('transitions in_progress → ready_to_submit, sets slot and appends history', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      const result = await repository.updateReportStatus({
        reportId,
        version: 1,
        status: REPORT_STATUS.READY_TO_SUBMIT,
        slot: REPORT_STATUS_SLOT.READY,
        changedBy
      })

      expect(result).toMatchObject({
        id: reportId,
        version: 2,
        status: {
          currentStatus: REPORT_STATUS.READY_TO_SUBMIT,
          [REPORT_STATUS_SLOT.READY]: { at: expect.any(String), by: changedBy },
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
        slot: REPORT_STATUS_SLOT.READY,
        changedBy
      })

      const result = await repository.updateReportStatus({
        reportId,
        version: 2,
        status: REPORT_STATUS.SUBMITTED,
        slot: REPORT_STATUS_SLOT.SUBMITTED,
        changedBy,
        submissionDeclaredBy: 'Jane Smith'
      })

      expect(result).toMatchObject({
        id: reportId,
        version: 3,
        submissionDeclaredBy: 'Jane Smith',
        status: {
          currentStatus: REPORT_STATUS.SUBMITTED,
          [REPORT_STATUS_SLOT.SUBMITTED]: {
            at: expect.any(String),
            by: changedBy
          },
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

    it('does not set submissionDeclaredBy on ready_to_submit slot', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      const result = await repository.updateReportStatus({
        reportId,
        version: 1,
        status: REPORT_STATUS.READY_TO_SUBMIT,
        slot: REPORT_STATUS_SLOT.READY,
        changedBy
      })

      expect(result.status[REPORT_STATUS_SLOT.READY]).not.toHaveProperty(
        'submissionDeclaredBy'
      )
    })

    it('transitions submitted → ready_to_submit with unsubmitted slot, preserving prior slots', async () => {
      const adminUser = {
        id: 'admin-1',
        name: 'Admin User',
        position: 'Service Maintainer'
      }
      const reportId = await createAndSubmitReport(repository)
      const before = await repository.findReportById(reportId)

      const result = await repository.updateReportStatus({
        reportId,
        version: 3,
        status: REPORT_STATUS.READY_TO_SUBMIT,
        slot: REPORT_STATUS_SLOT.UNSUBMITTED,
        changedBy: adminUser
      })

      expect(result).toMatchObject({
        id: reportId,
        version: 4,
        status: {
          currentStatus: REPORT_STATUS.READY_TO_SUBMIT,
          [REPORT_STATUS_SLOT.UNSUBMITTED]: {
            at: expect.any(String),
            by: adminUser
          }
        }
      })
      expect(result.status[REPORT_STATUS_SLOT.CREATED]).toEqual(
        before.status[REPORT_STATUS_SLOT.CREATED]
      )
      expect(result.status[REPORT_STATUS_SLOT.READY]).toEqual(
        before.status[REPORT_STATUS_SLOT.READY]
      )
      expect(result.status[REPORT_STATUS_SLOT.SUBMITTED]).toEqual(
        before.status[REPORT_STATUS_SLOT.SUBMITTED]
      )
      expect(result.status.history.at(-1)).toMatchObject({
        status: REPORT_STATUS.READY_TO_SUBMIT,
        at: expect.any(String),
        by: adminUser
      })
    })

    it('increments version on status update', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      const result = await repository.updateReportStatus({
        reportId,
        version: 1,
        status: REPORT_STATUS.READY_TO_SUBMIT,
        slot: REPORT_STATUS_SLOT.READY,
        changedBy
      })

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
          status: REPORT_STATUS.READY_TO_SUBMIT,
          slot: REPORT_STATUS_SLOT.READY,
          changedBy
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
          changedBy,
          slot: REPORT_STATUS_SLOT.READY,
          status: 'INVALID-STATUS'
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })

    it('throws notFound for unknown reportId', async () => {
      await expect(
        repository.updateReportStatus({
          reportId: 'non-existent-id',
          version: 1,
          status: REPORT_STATUS.READY_TO_SUBMIT,
          slot: REPORT_STATUS_SLOT.READY,
          changedBy
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 404 } })
    })
  })
}
