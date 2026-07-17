import { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'
import { buildDraftReport } from '#vite/helpers/build-draft-report.js'

/**
 * Seeds the resubmission-in-progress scenario both CSV feeds must handle:
 * submission 1 submitted, with an in-flight submission 2 draft sitting over it.
 * Both projections must keep showing submission 1's figures until submission 2
 * is itself submitted.
 *
 * The identity fields apply to both submissions; any further content (e.g. prn,
 * supportingInformation) is set on the submitted report, so tests can assert
 * those fields survive the in-flight draft.
 *
 * @param {import('#reports/repository/port.js').ReportsRepository} reportsRepository
 * @param {{
 *   organisationId: string,
 *   registrationId: string,
 *   year: number,
 *   cadence: string,
 *   period: number
 * } & Partial<import('#reports/repository/port.js').CreateReportParams>} params
 */
export async function seedInFlightResubmission(reportsRepository, params) {
  const { organisationId, registrationId, year, cadence, period, ...content } =
    params
  const identity = { organisationId, registrationId, year, cadence, period }
  await buildSubmittedReport(reportsRepository, { ...identity, ...content })
  await buildDraftReport(reportsRepository, {
    ...identity,
    submissionNumber: 2
  })
}
