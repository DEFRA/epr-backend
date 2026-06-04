import {
  REPORT_STATUS,
  REPORT_STATUS_SLOT
} from '#reports/domain/report-status.js'
import { beforeEach, describe, expect } from 'vitest'
import {
  buildCreateReportParams,
  DEFAULT_CHANGED_BY,
  DEFAULT_ORG_ID,
  DEFAULT_REG_ID
} from './test-data.js'

export const testFindReportsByStatusBehaviour = (it) => {
  describe('findReportsByStatus', () => {
    let repository

    beforeEach(
      async (
        /** @type {{ reportsRepository: () => import('#reports/repository/port.js').ReportsRepository }} */ {
          reportsRepository
        }
      ) => {
        repository = reportsRepository()
      }
    )

    it('returns in_progress reports matching the given statuses', async () => {
      const { id } = await repository.createReport(buildCreateReportParams())

      const results = await repository.findReportsByStatus(
        DEFAULT_ORG_ID,
        DEFAULT_REG_ID,
        [REPORT_STATUS.IN_PROGRESS]
      )

      expect(results).toHaveLength(1)
      expect(results[0].id).toBe(id)
    })

    it('returns ready_to_submit reports when that status is included', async () => {
      const { id } = await repository.createReport(buildCreateReportParams())
      await repository.updateReportStatus({
        reportId: id,
        version: 1,
        status: REPORT_STATUS.READY_TO_SUBMIT,
        slot: REPORT_STATUS_SLOT.READY,
        changedBy: DEFAULT_CHANGED_BY
      })

      const results = await repository.findReportsByStatus(
        DEFAULT_ORG_ID,
        DEFAULT_REG_ID,
        [REPORT_STATUS.IN_PROGRESS, REPORT_STATUS.READY_TO_SUBMIT]
      )

      expect(results).toHaveLength(1)
      expect(results[0].id).toBe(id)
    })

    it('excludes submitted reports', async () => {
      const { id } = await repository.createReport(buildCreateReportParams())
      await repository.updateReportStatus({
        reportId: id,
        version: 1,
        status: REPORT_STATUS.READY_TO_SUBMIT,
        slot: REPORT_STATUS_SLOT.READY,
        changedBy: DEFAULT_CHANGED_BY
      })
      await repository.updateReportStatus({
        reportId: id,
        version: 2,
        status: REPORT_STATUS.SUBMITTED,
        slot: REPORT_STATUS_SLOT.SUBMITTED,
        changedBy: DEFAULT_CHANGED_BY
      })

      const results = await repository.findReportsByStatus(
        DEFAULT_ORG_ID,
        DEFAULT_REG_ID,
        [REPORT_STATUS.IN_PROGRESS, REPORT_STATUS.READY_TO_SUBMIT]
      )

      expect(results).toHaveLength(0)
    })

    it('returns empty array when no reports match', async () => {
      const results = await repository.findReportsByStatus(
        DEFAULT_ORG_ID,
        DEFAULT_REG_ID,
        [REPORT_STATUS.IN_PROGRESS]
      )

      expect(results).toHaveLength(0)
    })
  })
}
