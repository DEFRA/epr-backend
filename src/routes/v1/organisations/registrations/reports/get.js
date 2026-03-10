import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { MONTHLY, QUARTERLY } from '#domain/reports/cadence.js'
import { getCurrentPeriod } from '#domain/reports/current-period.js'

export const reportsGetPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/reports'

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
    const { organisationsRepository, params } = request
    const { organisationId, registrationId } = params

    const registration = await organisationsRepository.findRegistrationById(
      organisationId,
      registrationId
    )

    const cadence = registration.accreditationId ? MONTHLY : QUARTERLY
    const period = getCurrentPeriod(cadence)

    return h
      .response({ cadence: cadence.id, periods: [period] })
      .code(StatusCodes.OK)
  }
}
