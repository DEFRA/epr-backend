import { StatusCodes } from 'http-status-codes'
import { ROLES, SCOPES } from '#common/helpers/auth/constants.js'
import Joi from 'joi'
import { wasteBalanceResponseSchema } from './response.schema.js'

export const wasteBalanceGetPath =
  '/v1/organisations/{organisationId}/waste-balances'

export const wasteBalanceGet = {
  method: 'GET',
  path: wasteBalanceGetPath,
  options: {
    auth: {
      scope: [ROLES.standardUser, SCOPES.adminRead]
    },
    tags: ['api'],
    validate: {
      params: Joi.object({
        organisationId: Joi.string()
          .pattern(/^[a-f0-9]{24}$/)
          .required()
          .messages({
            'string.pattern.base':
              'organisationId must be a valid 24-character hex string'
          })
      }),
      query: Joi.object({
        accreditationIds: Joi.string()
          .required()
          .pattern(/^[a-f0-9]{24}(,[a-f0-9]{24})*$/)
          .messages({
            'string.pattern.base':
              'accreditationIds must be comma-separated 24-character hex strings'
          })
      })
    },
    response: {
      schema: wasteBalanceResponseSchema
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest} request
   * @param {import('#common/hapi-types.js').HapiResponseToolkit} h
   * @returns {Promise<import('#common/hapi-types.js').HapiResponseObject>}
   */
  handler: async (
    { wasteBalanceService, organisationsRepository, query, params },
    h
  ) => {
    const { organisationId } = params
    const accreditationIds = new Set(
      /** @type {string} */ (query.accreditationIds).split(',')
    )

    const [organisation] = await organisationsRepository.findByIds([
      organisationId
    ])
    const registrations = organisation?.registrations ?? []

    const registrationIdByAccreditationId = new Map(
      registrations
        .filter((registration) => registration.accreditationId)
        .map((registration) => [registration.accreditationId, registration.id])
    )

    const balances = await Promise.all(
      [...accreditationIds].map(async (accreditationId) => {
        const registrationId =
          registrationIdByAccreditationId.get(accreditationId)
        if (!registrationId) {
          return null
        }

        const balance = await wasteBalanceService.currentBalance({
          organisationId,
          registrationId,
          accreditationId
        })

        return {
          accreditationId,
          amount: balance?.amount ?? 0,
          availableAmount: balance?.availableAmount ?? 0
        }
      })
    )

    /** @type {Record<string, { amount: number, availableAmount: number }>} */
    const balanceMap = {}
    for (const balance of balances) {
      if (balance) {
        balanceMap[balance.accreditationId] = {
          amount: balance.amount,
          availableAmount: balance.availableAmount
        }
      }
    }

    return h.response(balanceMap).code(StatusCodes.OK)
  }
}
