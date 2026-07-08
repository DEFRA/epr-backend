import Joi from 'joi'

import { cadenceSchema, periodSchema } from '#reports/repository/schema.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { generateReportingPeriods } from '#reports/domain/generate-reporting-periods.js'
import { isRegistrationAccredited } from '#domain/organisations/registration-utils.js'
import { mergeReportingPeriods } from '#reports/domain/merge-reporting-periods.js'

/**
 * @import { HapiRequest } from '#common/hapi-types.js'
 * @import { MergedPeriod } from '#reports/domain/merge-reporting-periods.js'
 * @import { CalendarPeriod } from '#reports/domain/build-calendar-periods.js'
 * @import { ReportSummary, ReportListItem } from '#reports/repository/port.js'
 */

const MIN_YEAR = 2024
const MAX_YEAR = 2100

export const periodParamsSchema = Joi.object({
  organisationId: Joi.string().required(),
  registrationId: Joi.string().required(),
  year: Joi.number().integer().min(MIN_YEAR).max(MAX_YEAR).required(),
  cadence: cadenceSchema,
  period: periodSchema,
  submissionNumber: Joi.number().integer().min(1).required()
})

/**
 * @import { Cadence } from '#reports/domain/cadence.js'
 *
 * @typedef {{
 *   organisationId: string,
 *   registrationId: string,
 *   year: number,
 *   cadence: Cadence,
 *   period: number
 * }} PeriodPathParams
 *
 * @typedef {PeriodPathParams & { submissionNumber: number }} PeriodWithSubmissionPathParams
 */

/**
 * Wraps a report (stored or computed) with registration details.
 * @param {object} report
 * @param {object} registration
 * @returns {object}
 */
export function withRegistrationDetails(report, registration) {
  return {
    ...report,
    details: {
      material: registration.material,
      site: registration.site
    }
  }
}

/**
 * Curates a full report summary down to the calendar list-response shape so
 * calendar-style endpoints don't leak heavy activity payloads.
 * @param {ReportSummary | null} report
 * @returns {ReportListItem | null}
 */
export function toReportListItem(report) {
  if (!report) {
    return null
  }
  const { id, status, submissionNumber, submittedAt, submittedBy } = report
  return { id, status, submissionNumber, submittedAt, submittedBy }
}

/**
 * Shared read model for the calendar-shaped reporting endpoints. Resolves the
 * cadence from the registration, computes the current-year periods, merges the
 * persisted reports, expands them via the supplied builder, then curates each
 * item's report to the list shape. The builder decides whether superseded
 * submissions are collapsed (calendar) or all surfaced (admin history).
 * @param {HapiRequest & {
 *   organisationsRepository: import('#repositories/organisations/port.js').OrganisationsRepository,
 *   reportsRepository: import('#reports/repository/port.js').ReportsRepository
 * }} request
 * @param {(mergedPeriods: MergedPeriod[]) => CalendarPeriod[]} buildPeriods
 * @returns {Promise<{ cadence: string, reportingPeriods: object[] }>}
 */
export async function buildReportingPeriodsResponse(request, buildPeriods) {
  const { organisationsRepository, reportsRepository, params } = request
  const { organisationId, registrationId } = params

  const registration = await organisationsRepository.findRegistrationById(
    organisationId,
    registrationId
  )

  const cadence = isRegistrationAccredited(registration)
    ? CADENCE.monthly
    : CADENCE.quarterly

  /**
   * We simply return for the current year for now for both Registered-Only
   * and Accredited Operators. Registered-only operators will need multi-year
   * support once outstanding historical reports are submitted.
   */
  const currentYear = new Date().getUTCFullYear()
  const computedPeriods = generateReportingPeriods(cadence, currentYear)

  const periodicReports = await reportsRepository.findPeriodicReports({
    organisationId,
    registrationId
  })

  const merged = mergeReportingPeriods(
    computedPeriods,
    periodicReports,
    cadence
  )

  // Calendar periods are ended or carry a report, so periodStatus is non-null.
  const reportingPeriods = buildPeriods(merged).map((period) => ({
    ...period,
    report: toReportListItem(period.report)
  }))

  return { cadence, reportingPeriods }
}

/**
 * Extracts a changedBy user summary from request credentials.
 * Carries name and email distinctly: name is omitted when there is no real
 * name, and the email is never coerced into the name slot.
 * @param {object} credentials
 * @returns {{ id: string, name?: string, email?: string, position: string }}
 */
export function extractChangedBy(credentials) {
  return {
    id: credentials.id,
    ...(credentials.name && { name: credentials.name }),
    ...(credentials.email && { email: credentials.email }),
    position: credentials.position ?? 'User'
  }
}
