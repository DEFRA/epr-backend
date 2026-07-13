import { buildCreateReportParams } from '#reports/repository/contract/test-data.js'

const AUTHOR = { id: 'user-1', name: 'Jane Smith', position: 'Officer' }

/**
 * Creates an in-flight (in_progress) report, i.e. a draft that has not been
 * submitted. Mirrors buildSubmittedReport for the pre-submission case so tests
 * seed drafts through a builder rather than a raw createReport call.
 *
 * @param {import('#reports/repository/port.js').ReportsRepository} reportsRepository
 * @param {Partial<import('#reports/repository/port.js').CreateReportParams>} [overrides]
 * @returns {Promise<string>} the draft report id
 */
export async function buildDraftReport(reportsRepository, overrides = {}) {
  const { id } = await reportsRepository.createReport(
    buildCreateReportParams({ changedBy: AUTHOR, ...overrides })
  )
  return id
}
