import { StatusCodes } from 'http-status-codes'
import Boom from '@hapi/boom'
import { ROLES } from '#common/helpers/auth/constants.js'
import { aggregateAvailableBalance } from '#application/waste-balance-availability/aggregate-available-balance.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { wasteBalanceAvailabilityResponseSchema } from './response.schema.js'

export const wasteBalanceAvailabilityPath = '/v1/waste-balance-availability'

export const getWasteBalanceAvailability = {
  method: 'GET',
  path: wasteBalanceAvailabilityPath,
  options: {
    auth: {
      scope: [ROLES.serviceMaintainer]
    },
    tags: ['api', 'admin'],
    response: {
      schema: wasteBalanceAvailabilityResponseSchema
    }
  },
  handler: async (request, h) => {
    const {
      db,
      logger /** @type {import('#common/hapi-types.js').TypedLogger} */
    } = request

    try {
      const result = await aggregateAvailableBalance(db)

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
        err: error,
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
