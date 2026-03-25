import { describe, beforeEach, expect } from 'vitest'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { buildCreateReportParams } from './test-data.js'
import { MONTHLY_PERIODS } from '#reports/domain/period-labels.js'

export const testFindReportStatusesByIdsBehaviour = (it) => {
  describe('findReportStatusesByIds', () => {
    let repository

    beforeEach(async ({ reportsRepository }) => {
      repository = reportsRepository()
    })

    it('returns statuses for known report IDs', async () => {
      const { id: id1 } = await repository.createReport(
        buildCreateReportParams({ period: MONTHLY_PERIODS.January })
      )
      const { id: id2 } = await repository.createReport(
        buildCreateReportParams({ period: MONTHLY_PERIODS.February })
      )

      const result = await repository.findReportStatusesByIds([id1, id2])

      expect(result).toBeInstanceOf(Map)
      expect(result.get(id1)).toBe(REPORT_STATUS.IN_PROGRESS)
      expect(result.get(id2)).toBe(REPORT_STATUS.IN_PROGRESS)
    })

    it('returns empty map for empty input', async () => {
      const result = await repository.findReportStatusesByIds([])

      expect(result).toBeInstanceOf(Map)
      expect(result.size).toBe(0)
    })

    it('omits IDs that do not exist', async () => {
      const { id } = await repository.createReport(buildCreateReportParams())

      const result = await repository.findReportStatusesByIds([
        id,
        'non-existent-id'
      ])

      expect(result.size).toBe(1)
      expect(result.get(id)).toBe(REPORT_STATUS.IN_PROGRESS)
    })
  })
}
