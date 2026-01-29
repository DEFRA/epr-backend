import { StatusCodes } from 'http-status-codes'
import Boom from '@hapi/boom'
import { ROLES } from '#common/helpers/auth/constants.js'
import { aggregateTonnageByMaterial } from '#application/tonnage-monitoring/aggregate-tonnage.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { tonnageMonitoringResponseSchema } from './response.schema.js'

export const tonnageMonitoringPath = '/v1/tonnage-monitoring'

export const getTonnageMonitoring = {
  method: 'GET',
  path: tonnageMonitoringPath,
  options: {
    auth: {
      scope: [ROLES.serviceMaintainer]
    },
    tags: ['api'],
    response: {
      schema: tonnageMonitoringResponseSchema
    }
  },
  handler: async (request, h) => {
    const { db, logger } = request

    try {
      const result = await aggregateTonnageByMaterial(db)

      logger.info({
        message: 'Tonnage monitoring data retrieved successfully',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
        }
      })

      return h.response(result).code(StatusCodes.OK)
    } catch (error) {
      logger.error({
        error,
        message: `Failure on ${tonnageMonitoringPath}`,
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

      throw Boom.badImplementation(`Failure on ${tonnageMonitoringPath}`)
    }
  }
}
