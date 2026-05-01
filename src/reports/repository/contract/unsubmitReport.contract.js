import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { beforeEach, describe, expect } from 'vitest'
import {
  buildCreateReportParams,
  createAndSubmitReport,
  DEFAULT_CHANGED_BY
} from './test-data.js'

export const testUnsubmitReportBehaviour = (it) => {
  describe('unsubmitReport', () => {
    let repository

    const changedBy = {
      id: 'admin-1',
      name: 'Admin User',
      position: 'Service Maintainer'
    }

    beforeEach(async ({ reportsRepository }) => {
      repository = reportsRepository()
    })

    it('transitions submitted → ready_to_submit and sets status.unsubmitted', async () => {
      const reportId = await createAndSubmitReport(repository)

      const result = await repository.unsubmitReport({
        reportId,
        version: 3,
        changedBy
      })

      expect(result).toMatchObject({
        id: reportId,
        version: 4,
        status: {
          currentStatus: REPORT_STATUS.READY_TO_SUBMIT,
          unsubmitted: { at: expect.any(String), by: changedBy }
        }
      })
    })

    it('preserves status.created, status.ready and status.submitted', async () => {
      const reportId = await createAndSubmitReport(repository)
      const before = await repository.findReportById(reportId)

      const result = await repository.unsubmitReport({
        reportId,
        version: 3,
        changedBy
      })

      expect(result.status.created).toEqual(before.status.created)
      expect(result.status.ready).toEqual(before.status.ready)
      expect(result.status.submitted).toEqual(before.status.submitted)
    })

    it('appends ready_to_submit to status.history', async () => {
      const reportId = await createAndSubmitReport(repository)

      const result = await repository.unsubmitReport({
        reportId,
        version: 3,
        changedBy
      })

      const lastEntry = result.status.history.at(-1)
      expect(lastEntry).toMatchObject({
        status: REPORT_STATUS.READY_TO_SUBMIT,
        at: expect.any(String),
        by: changedBy
      })
    })

    it('increments version', async () => {
      const reportId = await createAndSubmitReport(repository)

      const result = await repository.unsubmitReport({
        reportId,
        version: 3,
        changedBy
      })

      expect(result.version).toBe(4)
    })

    it('throws conflict when version does not match', async () => {
      const reportId = await createAndSubmitReport(repository)

      await expect(
        repository.unsubmitReport({ reportId, version: 99, changedBy })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 409 } })
    })

    it('throws notFound for unknown reportId', async () => {
      await expect(
        repository.unsubmitReport({
          reportId: 'ffffffff-ffff-4fff-bfff-ffffffffffff',
          version: 1,
          changedBy
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 404 } })
    })

    it('throws error on invalid params', async () => {
      const { id: reportId } = await repository.createReport(
        buildCreateReportParams()
      )

      await expect(
        repository.unsubmitReport({
          reportId,
          version: 0,
          changedBy: DEFAULT_CHANGED_BY
        })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })
  })
}
