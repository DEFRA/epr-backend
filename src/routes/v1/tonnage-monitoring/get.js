import { StatusCodes } from 'http-status-codes'
import Boom from '@hapi/boom'
import Joi from 'joi'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { openYearSchema } from '#common/validation/year-schema.js'
import { aggregateTonnageByMaterial } from '#application/tonnage-monitoring/aggregate-tonnage.js'
import { createTonnageQuery } from '#waste-records/repository/tonnage-query.mongodb.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { tonnageMonitoringResponseSchema } from './response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */

export const tonnageMonitoringPath = '/v1/tonnage-monitoring'

export const getTonnageMonitoring = {
  method: 'GET',
  path: tonnageMonitoringPath,
  options: {
    auth: {
      scope: [SCOPES.adminRead]
    },
    tags: ['api', 'admin'],
    validate: {
      query: Joi.object({ year: openYearSchema().required() })
    },
    response: {
      schema: tonnageMonitoringResponseSchema
    }
  },
  /**
   * @param {HapiRequest & { query: { year: Year } }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const {
      db,
      ledgerRepository,
      organisationReadRepository,
      logger,
      query: { year }
    } = request

    try {
      const result = await aggregateTonnageByMaterial(
        createTonnageQuery(db),
        ledgerRepository,
        organisationReadRepository,
        year
      )

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
        err: /** @type {Error} */ (error),
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
