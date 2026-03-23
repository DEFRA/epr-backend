import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { generateReportingPeriods } from '#reports/domain/generate-reporting-periods.js'
import { mergeReportingPeriods } from '#reports/domain/merge-reporting-periods.js'

export const reportsGetPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/reports/calendar'

export const reportsGet = {
  method: 'GET',
  path: reportsGetPath,
  options: {
    auth: getAuthConfig([ROLES.standardUser]),
    tags: ['api'],
    validate: {
      params: Joi.object({
        organisationId: Joi.string().required(),
        registrationId: Joi.string().required()
      })
    }
  },
  handler: async (request, h) => {
    const { organisationsRepository, reportsRepository, params } = request
    const { organisationId, registrationId } = params

    const registration = await organisationsRepository.findRegistrationById(
      organisationId,
      registrationId
    )

    const isAccredited = Boolean(registration.accreditationId)
    const cadence = isAccredited ? CADENCE.monthly : CADENCE.quarterly

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

    const reportIds = periodicReports.flatMap(
      /* c8 ignore next -- optional chain fallback never hit; reports always exists */
      (pr) =>
        Object.values(pr.reports?.[cadence] ?? {})
          .map((slot) => slot.currentReportId)
          .filter(Boolean)
    )

    const reportStatusMap = new Map()
    await Promise.all(
      reportIds.map(async (reportId) => {
        const report = await reportsRepository.findReportById(reportId)
        reportStatusMap.set(reportId, report.status)
      })
    )

    const reportingPeriods = mergeReportingPeriods(
      computedPeriods,
      periodicReports,
      cadence,
      reportStatusMap
    )

    return h.response({ cadence, reportingPeriods }).code(StatusCodes.OK)
  }
}
