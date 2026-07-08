import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { buildAllSubmissionPeriods } from '#reports/domain/build-all-submission-periods.js'
import { buildReportingPeriodsResponse } from './shared.js'
import { reportsCalendarResponseSchema } from './response.schema.js'

/**
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import { ReportsRepository } from '#reports/repository/port.js'
 */

export const adminReportSubmissionsGetPath =
  '/v1/admin/organisations/{organisationId}/registrations/{registrationId}/report-submissions'

export const adminReportSubmissionsGet = {
  method: 'GET',
  path: adminReportSubmissionsGetPath,
  options: {
    auth: getAuthConfig([SCOPES.adminRead]),
    tags: ['api', 'admin'],
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
    const body = await buildReportingPeriodsResponse(
      request,
      buildAllSubmissionPeriods
    )
    return h.response(body).code(StatusCodes.OK)
  }
}
