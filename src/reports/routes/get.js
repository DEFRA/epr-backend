import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { buildCalendarPeriods } from '#reports/domain/build-calendar-periods.js'
import { buildAllSubmissionPeriods } from '#reports/domain/build-all-submission-periods.js'
import { generateReportingPeriods } from '#reports/domain/generate-reporting-periods.js'
import {
  activeAccreditationValidFrom,
  isRegistrationAccredited
} from '#domain/organisations/registration-utils.js'
import { mergeReportingPeriods } from '#reports/domain/merge-reporting-periods.js'
import { reportsCalendarResponseSchema } from './response.schema.js'

/**
 * @import { Cadence } from '#reports/domain/cadence.js'
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import { MergedPeriod } from '#reports/domain/merge-reporting-periods.js'
 * @import { CalendarPeriod } from '#reports/domain/build-calendar-periods.js'
 * @import {
 *   ReportsRepository,
 *   ReportSummary,
 *   ReportListItem
 * } from '#reports/repository/port.js'
 */

/**
 * @typedef {(mergedPeriods: MergedPeriod[]) => CalendarPeriod[]} PeriodBuilder
 */

export const reportsGetPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/reports/calendar'

/**
 * The years the calendar will answer for. Wide enough to cover every year the
 * service holds data for, and narrow enough that a typo is rejected rather than
 * generating periods for the year 40000.
 */
const MIN_YEAR = 2024
const MAX_YEAR = 2100

/**
 * Curates the full report summary down to the list-response shape so the
 * calendar endpoint doesn't leak heavy activity payloads.
 * @param {ReportSummary | null} current
 * @returns {ReportListItem | null}
 */
const toReportListItem = (current) => {
  if (!current) {
    return null
  }
  const { id, status, submissionNumber, submittedAt, submittedBy } = current
  return { id, status, submissionNumber, submittedAt, submittedBy }
}

/**
 * Chooses the period builder for this request. The opt-in ?expand=submissions
 * view surfaces the previous submissions the default calendar collapses; the
 * same history is already available on the report-detail view, so it needs no
 * further gating. Every other request keeps today's collapsing behaviour.
 * @param {HapiRequest} request
 * @returns {PeriodBuilder}
 */
const selectPeriodBuilder = (request) =>
  /** @type {{ expand?: string }} */ (request.query).expand === 'submissions'
    ? buildAllSubmissionPeriods
    : buildCalendarPeriods

export const reportsGet = {
  method: 'GET',
  path: reportsGetPath,
  options: {
    auth: getAuthConfig([SCOPES.organisationRead, SCOPES.adminRead]),
    tags: ['api'],
    validate: {
      params: Joi.object({
        organisationId: Joi.string().required(),
        registrationId: Joi.string().required()
      }),
      query: Joi.object({
        expand: Joi.string().valid('submissions'),
        year: Joi.number().integer().min(MIN_YEAR).max(MAX_YEAR),
        cadence: Joi.string().valid(...Object.values(CADENCE))
      })
    },
    response: {
      schema: reportsCalendarResponseSchema
    }
  },
  /**
   * @param {HapiRequest & {
   *   organisationsRepository: OrganisationsRepository,
   *   params: { organisationId: string, registrationId: string },
   *   reportsRepository: ReportsRepository
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisationsRepository, reportsRepository, params } = request
    const { organisationId, registrationId } = params

    const registration = await organisationsRepository.findRegistrationById(
      organisationId,
      registrationId
    )

    const { cadence: askedCadence, year: askedYear } =
      /** @type {{ cadence?: Cadence, year?: number }} */ (request.query)

    const cadence =
      askedCadence ??
      (isRegistrationAccredited(registration)
        ? CADENCE.monthly
        : CADENCE.quarterly)

    /**
     * Without a year the calendar answers for the current one, as it always
     * has. A caller reading a period that has already closed - a regulator
     * opening a registered-only year, say - names the year it wants.
     */
    const year = askedYear ?? new Date().getUTCFullYear()

    /**
     * What the periods are bounded by depends on who is asking.
     *
     * Left to itself, the calendar answers the cadence the registration owes
     * *now*, and an accredited operator owes monthly reports only from the date
     * their accreditation began - so that date is the bound.
     *
     * A caller naming a cadence is asking a different question: which periods
     * did this registration owe under that cadence. Bounding those to the
     * accreditation would be wrong in both directions - it would trim the
     * quarters owed before the accreditation began, which are exactly the ones
     * being asked for, and it says nothing at all where no accreditation was
     * ever granted. The registration's own start date is the honest bound:
     * nothing is owed before the registration existed.
     *
     * A registration that was never approved carries no start date, and
     * `generateReportingPeriods` applies a bound only when it has one - so an
     * unapproved registration is bounded by nothing rather than by a date it
     * does not hold.
     */
    const fromDate = askedCadence
      ? registration.validFrom
      : activeAccreditationValidFrom(registration.accreditation)

    const computedPeriods = generateReportingPeriods(
      cadence,
      year,
      undefined,
      fromDate
    )

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
    const buildPeriods = selectPeriodBuilder(request)
    const reportingPeriods = buildPeriods(merged).map((period) => ({
      ...period,
      report: toReportListItem(period.report)
    }))

    return h.response({ cadence, reportingPeriods }).code(StatusCodes.OK)
  }
}
