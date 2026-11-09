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
 *   organisationNumber: import('#domain/organisations/numbers.js').OrganisationNumber,
 *   registrationNumber: import('#domain/organisations/numbers.js').RegistrationNumber,
 *   year: number,
 *   cadence: import('#reports/domain/cadence.js').Cadence,
 *   period: number
 * } & Partial<import('#reports/repository/port.js').CreateReportBase>} params
 */
export async function seedInFlightResubmission(reportsRepository, params) {
  const {
    organisationNumber,
    registrationNumber,
    year,
    cadence,
    period,
    ...content
  } = params
  const identity = {
    organisationNumber,
    registrationNumber,
    year,
    cadence,
    period
  }
  await buildSubmittedReport(reportsRepository, { ...identity, ...content })
  await buildDraftReport(reportsRepository, {
    ...identity,
    submissionNumber: 2
  })
}
