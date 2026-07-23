import { buildCreateReportParams } from '#reports/repository/contract/test-data.js'

/**
 * Creates a report and leaves it in its initial draft status.
 *
 * @param {import('#reports/repository/port.js').ReportsRepository} reportsRepository
 * @param {Partial<import('#reports/repository/port.js').CreateReportParams>} [overrides]
 * @returns {Promise<string>} the created report id
 */
export async function createDraftReport(reportsRepository, overrides = {}) {
  const { id } = await reportsRepository.createReport(
    buildCreateReportParams(overrides)
  )
  return id
}
