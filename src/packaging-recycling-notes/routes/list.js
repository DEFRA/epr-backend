import Joi from 'joi'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { mapToExternalPrn } from '#packaging-recycling-notes/application/external-prn-mapper.js'

/**
 * @import {PackagingRecyclingNotesRepository} from '#packaging-recycling-notes/repository/port.js'
 */

const ALLOWED_STATUSES = ['awaiting_acceptance', 'cancelled']
const DEFAULT_LIMIT = 200
const MAX_LIMIT = 500

export const packagingRecyclingNotesListPath = '/v1/packaging-recycling-notes'

export const packagingRecyclingNotesList = {
  method: 'GET',
  path: packagingRecyclingNotesListPath,
  options: {
    auth: { strategy: 'api-gateway-client' },
    tags: ['api'],
    validate: {
      query: Joi.object({
        statuses: Joi.string()
          .custom((value, helpers) => {
            const statuses = value.split(',')
            const invalid = statuses.filter(
              (s) => !ALLOWED_STATUSES.includes(s)
            )
            if (invalid.length > 0) {
              return helpers.error('any.invalid')
            }
            return statuses
          })
          .required()
          .messages({
            'any.invalid': `statuses must be one or more of: ${ALLOWED_STATUSES.join(', ')}`
          }),
        dateFrom: Joi.string().isoDate().optional().messages({
          'string.isoDate': 'dateFrom must be a valid ISO 8601 date-time'
        }),
        dateTo: Joi.string().isoDate().optional().messages({
          'string.isoDate': 'dateTo must be a valid ISO 8601 date-time'
        }),
        limit: Joi.number().integer().min(1).optional(),
        cursor: Joi.string().optional()
      })
    }
  },
  /** @param {import('#common/hapi-types.js').HapiRequest & {lumpyPackagingRecyclingNotesRepository: PackagingRecyclingNotesRepository}} request */
  handler: async (request, h) => {
    const { lumpyPackagingRecyclingNotesRepository, logger } = request
    const { statuses, dateFrom, dateTo, limit, cursor } = request.query

    try {
      const effectiveLimit = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT)

      const result = await lumpyPackagingRecyclingNotesRepository.findByStatus({
        statuses,
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
        limit: effectiveLimit,
        cursor
      })

      const response = {
        items: result.items.map(mapToExternalPrn),
        hasMore: result.hasMore
      }

      if (result.nextCursor) {
        response.nextCursor = result.nextCursor
      }

      logger.info({
        message: `Listed ${result.items.length} PRNs`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
        }
      })

      return h.response(response).code(StatusCodes.OK)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        err: error,
        message: `Failure on ${packagingRecyclingNotesListPath}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        }
      })

      throw Boom.badImplementation(
        `Failure on ${packagingRecyclingNotesListPath}`
      )
    }
  }
}
