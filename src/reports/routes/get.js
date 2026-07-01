import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

import { ROLES, SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { derivePeriodStatus } from '#reports/domain/derive-period-status.js'
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

export const reportsGet = {
  method: 'GET',
  path: reportsGetPath,
  options: {
    auth: getAuthConfig([ROLES.standardUser, SCOPES.adminRead]),
    tags: ['api'],
    validate: {
      params: Joi.object({
        organisationId: Joi.string().required(),
        registrationId: Joi.string().required()
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

    // submittedReport is omitted so the heavy latest-submitted payload never
    // reaches the response; the remaining fields pass through, with report
    // curated via toReportListItem. Calendar periods are ended or carry a
    // report, so periodStatus is non-null.
    const reportingPeriods = merged.map((period) => {
      const { submittedReport: _submittedReport, ...rest } = period
      return {
        ...rest,
        periodStatus: derivePeriodStatus(period),
        report: toReportListItem(period.report)
      }
    })

    return h.response({ cadence, reportingPeriods }).code(StatusCodes.OK)
  }
}
