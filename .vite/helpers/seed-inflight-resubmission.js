import { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'
import { buildDraftReport } from '#vite/helpers/build-draft-report.js'

/**
 * Seeds the resubmission-in-progress scenario both CSV feeds must handle:
 * submission 1 submitted, with an in-flight submission 2 draft sitting over it.
 * Both projections must keep showing submission 1's figures until submission 2
 * is itself submitted.
 *
 * @param {import('#reports/repository/port.js').ReportsRepository} reportsRepository
 * @param {{
 *   organisationId: string,
 *   registrationId: string,
 *   year: number,
 *   cadence: string,
 *   period: number,
 *   prn?: import('#reports/repository/port.js').CreateReportParams['prn']
 * }} params
 */
export async function seedInFlightResubmission(reportsRepository, params) {
  const { prn, ...base } = params
  await buildSubmittedReport(reportsRepository, prn ? { ...base, prn } : base)
  await buildDraftReport(reportsRepository, { ...base, submissionNumber: 2 })
}
