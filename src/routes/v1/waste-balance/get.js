import { StatusCodes } from 'http-status-codes'
import { ROLES } from '#common/helpers/auth/constants.js'
import Joi from 'joi'

/** @typedef {import('#repositories/waste-balances/port.js').WasteBalancesRepository} WasteBalancesRepository */

export const wasteBalanceGetPath = '/v1/waste-balance'

export const wasteBalanceGet = {
  method: 'GET',
  path: wasteBalanceGetPath,
  options: {
    auth: {
      scope: [ROLES.standardUser, ROLES.serviceMaintainer]
    },
    tags: ['api'],
    validate: {
      query: Joi.object({
        accreditationIds: Joi.string()
          .required()
          .pattern(/^[a-f0-9]{24}(,[a-f0-9]{24})*$/)
          .messages({
            'string.pattern.base':
              'accreditationIds must be comma-separated valid MongoDB ObjectIds'
          })
      })
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {wasteBalancesRepository: WasteBalancesRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async ({ wasteBalancesRepository, query }, h) => {
    const accreditationIds = query.accreditationIds.split(',')

    const wasteBalances =
      await wasteBalancesRepository.findByAccreditationIds(accreditationIds)

    // Transform to requested shape: { accreditationId: { amount, availableAmount } }
    const balanceMap = wasteBalances.reduce((acc, balance) => {
      acc[balance.accreditationId] = {
        amount: balance.amount ?? 0,
        availableAmount: balance.availableAmount ?? 0
      }
      return acc
    }, {})

    // Include requested IDs with zero balances if not found
    accreditationIds.forEach((id) => {
      if (!(id in balanceMap)) {
        balanceMap[id] = {
          amount: 0,
          availableAmount: 0
        }
      }
    })

    return h.response(balanceMap).code(StatusCodes.OK)
  }
}
