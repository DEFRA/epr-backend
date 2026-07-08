import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { buildCalendarPeriods } from '#reports/domain/build-calendar-periods.js'
import { buildAllSubmissionPeriods } from '#reports/domain/build-all-submission-periods.js'
import { generateReportingPeriods } from '#reports/domain/generate-reporting-periods.js'
import { isRegistrationAccredited } from '#domain/organisations/registration-utils.js'
import { mergeReportingPeriods } from '#reports/domain/merge-reporting-periods.js'
import { reportsCalendarResponseSchema } from './response.schema.js'

/**
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import {
 *   ReportsRepository,
 *   ReportSummary,
 *   ReportListItem
 * } from '#reports/repository/port.js'
 */

export const reportsGetPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/reports/calendar'

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
 * Chooses the period builder for this request. The expanded (all-submissions)
 * view surfaces superseded submissions the calendar normally collapses, so it is
 * opt-in via ?expand=submissions AND gated on admin.read: operators only ever
 * see today's collapsed calendar (ADR-0038). An operator passing the arg is
 * ignored rather than refused, keeping the shared route's behaviour unchanged
 * for every non-admin consumer.
 * @param {HapiRequest} request
 * @returns {typeof buildCalendarPeriods}
 */
const selectPeriodBuilder = (request) => {
  const expandRequested =
    /** @type {{ expand?: string }} */ (request.query).expand === 'submissions'
  const { scope = [] } = /** @type {{ scope?: string[] }} */ (
    /** @type {unknown} */ (request.auth.credentials)
  )
  const isAdmin = scope.includes(SCOPES.adminRead)
  return expandRequested && isAdmin
    ? buildAllSubmissionPeriods
    : buildCalendarPeriods
}

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
        expand: Joi.string().valid('submissions')
      })
    },
    response: {
      schema: reportsCalendarResponseSchema
    }
  },
  /**
   * @param {HapiRequest & {
   *   organisationsRepository: OrganisationsRepository,
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
    const buildPeriods = selectPeriodBuilder(request)
    const reportingPeriods = buildPeriods(merged).map((period) => ({
      ...period,
      report: toReportListItem(period.report)
    }))

    return h.response({ cadence, reportingPeriods }).code(StatusCodes.OK)
  }
}
