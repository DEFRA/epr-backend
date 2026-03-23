import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { cadenceSchema, periodSchema } from '#reports/repository/schema.js'

const MIN_YEAR = 2024
const MAX_YEAR = 2100

export const reportsDeletePath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/reports/{year}/{cadence}/{period}'

export const reportsDelete = {
  method: 'DELETE',
  path: reportsDeletePath,
  options: {
    auth: getAuthConfig([ROLES.standardUser]),
    tags: ['api'],
    validate: {
      params: Joi.object({
        organisationId: Joi.string().required(),
        registrationId: Joi.string().required(),
        year: Joi.number().integer().min(MIN_YEAR).max(MAX_YEAR).required(),
        cadence: cadenceSchema,
        period: periodSchema
      })
    }
  },
  handler: async (request, h) => {
    const { organisationsRepository, reportsRepository, params } = request
    const { organisationId, registrationId, year, cadence, period } = params

    // Validate registration exists (authorization check)
    await organisationsRepository.findRegistrationById(
      organisationId,
      registrationId
    )

    const changedBy = {
      id: request.auth.credentials.id,
      name: request.auth.credentials.name ?? request.auth.credentials.email,
      position: request.auth.credentials.position ?? 'User'
    }

    await reportsRepository.deleteReport({
      organisationId,
      registrationId,
      year,
      cadence,
      period,
      changedBy
    })

    return h.response().code(StatusCodes.NO_CONTENT)
  }
}
