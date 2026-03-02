import { StatusCodes } from 'http-status-codes'
import { ROLES } from '#common/helpers/auth/constants.js'
import Joi from 'joi'
import { wasteBalanceResponseSchema } from './response.schema.js'

/** @typedef {import('#repositories/waste-balances/port.js').WasteBalancesRepository} WasteBalancesRepository */

export const wasteBalanceGetPath =
  '/v1/organisations/{organisationId}/waste-balances'

export const wasteBalanceGet = {
  method: 'GET',
  path: wasteBalanceGetPath,
  options: {
    auth: {
      scope: [ROLES.standardUser, ROLES.serviceMaintainer]
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
   * @param {import('#common/hapi-types.js').HapiRequest & {wasteBalancesRepository: WasteBalancesRepository}} request
   * @param {import('#common/hapi-types.js').HapiResponseToolkit} h
   * @returns {Promise<import('#common/hapi-types.js').HapiResponseObject>}
   */
  handler: async ({ wasteBalancesRepository, query, params }, h) => {
    const { organisationId } = params
    const accreditationIds = query.accreditationIds.split(',')

    const wasteBalances =
      await wasteBalancesRepository.findByAccreditationIds(accreditationIds)

    // Verify all returned balances belong to the specified organisation
    const unauthorizedBalance = wasteBalances.find(
      (balance) => balance.organisationId !== organisationId
    )
    if (unauthorizedBalance) {
      return h
        .response({
          statusCode: StatusCodes.FORBIDDEN,
          error: 'Forbidden',
          message: `Accreditation ${unauthorizedBalance.accreditationId} does not belong to organisation ${organisationId}`
        })
        .code(StatusCodes.FORBIDDEN)
    }

    const balanceMap = wasteBalances.reduce((acc, balance) => {
      acc[balance.accreditationId] = {
        amount: balance.amount ?? 0,
        availableAmount: balance.availableAmount ?? 0
      }
      return acc
    }, {})

    return h.response(balanceMap).code(StatusCodes.OK)
  }
}
