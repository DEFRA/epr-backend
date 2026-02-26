import { StatusCodes } from 'http-status-codes'
import Boom from '@hapi/boom'
import { ROLES } from '#common/helpers/auth/constants.js'
import { aggregatePrnTonnage } from '#application/prn-tonnage/aggregate-prn-tonnage.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { prnTonnageResponseSchema } from './response.schema.js'

export const prnTonnagePath = '/v1/prn-tonnage'

export const getPrnTonnage = {
  method: 'GET',
  path: prnTonnagePath,
  options: {
    auth: {
      scope: [ROLES.serviceMaintainer]
    },
    tags: ['api', 'admin'],
    response: {
      schema: prnTonnageResponseSchema
    }
  },
  handler: async (request, h) => {
    const {
      db,
      logger /** @type {import('#common/hapi-types.js').TypedLogger} */
    } = request

    try {
      const result = await aggregatePrnTonnage(db)

      logger.info({
        message: 'PRN tonnage data retrieved successfully',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
        }
      })

      return h.response(result).code(StatusCodes.OK)
    } catch (error) {
      logger.error({
        err: error,
        message: `Failure on ${prnTonnagePath}`,
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

      throw Boom.badImplementation(`Failure on ${prnTonnagePath}`)
    }
  }
}
