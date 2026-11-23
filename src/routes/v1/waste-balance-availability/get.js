import { StatusCodes } from 'http-status-codes'
import Boom from '@hapi/boom'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { aggregateAvailableBalance } from '#application/waste-balance-availability/aggregate-available-balance.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { wasteBalanceAvailabilityResponseSchema } from './response.schema.js'
import { openYearSchema } from '#common/validation/year-schema.js'
import Joi from 'joi'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */

export const wasteBalanceAvailabilityPath = '/v1/waste-balance-availability'

export const getWasteBalanceAvailability = {
  method: 'GET',
  path: wasteBalanceAvailabilityPath,
  options: {
    auth: {
      scope: [SCOPES.adminRead]
    },
    tags: ['api', 'admin'],
    validate: {
      query: Joi.object({ year: openYearSchema().required() })
    },
    response: {
      schema: wasteBalanceAvailabilityResponseSchema
    }
  },
  /**
   * @param {HapiRequest & { query: { year: Year } }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const {
      organisationReadRepository,
      ledgerRepository,
      logger,
      query: { year }
    } = request

    try {
      const result = await aggregateAvailableBalance(
        organisationReadRepository,
        ledgerRepository,
        year
      )

      logger.info({
        message: 'Waste balance availability data retrieved successfully',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
        }
      })

      return h.response(result).code(StatusCodes.OK)
    } catch (error) {
      logger.error({
        err: /** @type {Error} */ (error),
        message: `Failure on ${wasteBalanceAvailabilityPath}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        },
        http: {
          response: {
            status_code: StatusCodes.INTERNAL_SERVER_ERROR
          }
        }
      })

      throw Boom.badImplementation(`Failure on ${wasteBalanceAvailabilityPath}`)
    }
  }
}
