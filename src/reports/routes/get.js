import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { MONTHLY, QUARTERLY } from '#reports/domain/cadence.js'
import { discoverPeriods } from '#reports/domain/discover-periods.js'
import { getOperatorCategory } from '#reports/domain/operator-category.js'

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
    const { organisationsRepository, wasteRecordsRepository, params } = request
    const { organisationId, registrationId } = params

    const registration = await organisationsRepository.findRegistrationById(
      organisationId,
      registrationId
    )

    const isAccredited = Boolean(registration.accreditationId)
    const cadence = isAccredited ? MONTHLY : QUARTERLY
    const operatorCategory = getOperatorCategory(registration)

    const wasteRecords = await wasteRecordsRepository.findByRegistration(
      organisationId,
      registrationId
    )

    const year = isAccredited ? new Date().getUTCFullYear() : undefined
    const periods = discoverPeriods(wasteRecords, operatorCategory, cadence, {
      year
    })

    return h.response({ cadence: cadence.id, periods }).code(StatusCodes.OK)
  }
}
