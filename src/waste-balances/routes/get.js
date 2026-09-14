import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import Joi from 'joi'
import { availableForPool } from '#waste-balances/domain/pool-balances.js'
import { POOL } from '#waste-balances/repository/ledger-schema.js'
import { wasteBalanceResponseSchema } from './response.schema.js'

/** @import { HapiRequest, HapiResponseObject, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { LedgerBalanceSnapshot } from '#waste-balances/repository/ledger-schema.js' */

/**
 * The separate December portion of a balance, plus the derived non-December
 * remainder of `availableAmount`, surfaced only when the accreditation holds
 * a December portion. A drained in-window pool still reports `0`s; an
 * accreditation with no December portion omits all three fields entirely -
 * its whole `availableAmount` already IS the only balance, so there is no
 * meaningful non-December split to report.
 *
 * @param {LedgerBalanceSnapshot | null} [balance]
 * @returns {{ decemberAmount?: number, decemberAvailableAmount?: number, nonDecemberAvailableAmount?: number }}
 */
const decemberFields = (balance) => ({
  ...(balance?.decemberAmount !== undefined && {
    decemberAmount: balance.decemberAmount
  }),
  ...(balance?.decemberAvailableAmount !== undefined && {
    decemberAvailableAmount: balance.decemberAvailableAmount,
    nonDecemberAvailableAmount: availableForPool(balance, POOL.GENERAL)
  })
})

export const wasteBalanceGetPath =
  '/v1/organisations/{organisationId}/waste-balances'

export const wasteBalanceGet = {
  method: 'GET',
  path: wasteBalanceGetPath,
  options: {
    auth: {
      scope: [SCOPES.organisationRead, SCOPES.adminRead]
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
   * @param {HapiRequest & {
   *   params: { organisationId: string },
   *   query: { accreditationIds: string }
   * }} request
   * @param {HapiResponseToolkit} h
   * @returns {Promise<HapiResponseObject>}
   */
  handler: async (
    { wasteBalanceService, organisationsRepository, query, params },
    h
  ) => {
    const { organisationId } = params
    const accreditationIds = new Set(query.accreditationIds.split(','))

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
          availableAmount: balance?.availableAmount ?? 0,
          ...decemberFields(balance)
        }
      })
    )

    /**
     * @type {Record<string, {
     *   amount: number,
     *   availableAmount: number,
     *   decemberAmount?: number,
     *   decemberAvailableAmount?: number,
     *   nonDecemberAvailableAmount?: number
     * }>}
     */
    const balanceMap = {}
    for (const balance of balances) {
      if (balance) {
        balanceMap[balance.accreditationId] = {
          amount: balance.amount,
          availableAmount: balance.availableAmount,
          ...decemberFields(balance)
        }
      }
    }

    return h.response(balanceMap).code(StatusCodes.OK)
  }
}
