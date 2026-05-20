import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import Joi from 'joi'

/** @typedef {import('#waste-balances/repository/port.js').WasteBalancesRepository} WasteBalancesRepository */

export const wasteBalanceGetTransactionsPath =
  '/v1/organisations/{organisationId}/accreditations/{accreditationId}/waste-balance/transactions'

const hexId = Joi.string().pattern(/^[a-f0-9]{24}$/)

export const wasteBalanceGetTransactions = {
  method: 'GET',
  path: wasteBalanceGetTransactionsPath,
  options: {
    auth: {
      scope: [SCOPES.adminRead]
    },
    tags: ['api'],
    validate: {
      params: Joi.object({
        organisationId: hexId.required().messages({
          'string.pattern.base':
            'organisationId must be a valid 24-character hex string'
        }),
        accreditationId: hexId.required().messages({
          'string.pattern.base':
            'accreditationId must be a valid 24-character hex string'
        })
      })
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {wasteBalancesRepository: WasteBalancesRepository}} request
   * @param {import('#common/hapi-types.js').HapiResponseToolkit} h
   * @returns {Promise<import('#common/hapi-types.js').HapiResponseObject>}
   */
  handler: async ({ wasteBalancesRepository, params }, h) => {
    const { organisationId, accreditationId } = params

    const balance =
      await wasteBalancesRepository.findByAccreditationId(accreditationId)

    if (!balance) {
      return h
        .response({
          statusCode: StatusCodes.NOT_FOUND,
          error: 'Not Found',
          message: `No waste balance found for accreditation ${accreditationId}`
        })
        .code(StatusCodes.NOT_FOUND)
    }

    if (balance.organisationId !== organisationId) {
      return h
        .response({
          statusCode: StatusCodes.FORBIDDEN,
          error: 'Forbidden',
          message: `Accreditation ${accreditationId} does not belong to organisation ${organisationId}`
        })
        .code(StatusCodes.FORBIDDEN)
    }

    return h.response(balance.transactions ?? []).code(StatusCodes.OK)
  }
}
