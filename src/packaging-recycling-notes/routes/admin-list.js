import Joi from 'joi'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { mapToAdminPrn } from '#packaging-recycling-notes/application/admin-prn-mapper.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { createStatusesValidator } from '#packaging-recycling-notes/routes/validation.js'

/**
 * @import {PackagingRecyclingNotesRepository} from '#packaging-recycling-notes/repository/port.js'
 * @import {PrnStatus} from '#packaging-recycling-notes/domain/model.js'
 */

const DEFAULT_LIMIT = 500

export const adminPackagingRecyclingNotesListPath =
  '/v1/admin/packaging-recycling-notes'

export const adminPackagingRecyclingNotesList = {
  method: 'GET',
  path: adminPackagingRecyclingNotesListPath,
  options: {
    auth: getAuthConfig([SCOPES.adminRead]),
    tags: ['api'],
    validate: {
      query: Joi.object({
        statuses: createStatusesValidator(Object.values(PRN_STATUS)),
        limit: Joi.number().integer().min(1).max(1000).optional(),
        cursor: Joi.string().optional()
      })
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {
   *   packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository,
   *   query: {
   *     statuses: PrnStatus[],
   *     limit?: number,
   *     cursor?: string
   *   }
   * }} request
   */
  handler: async (request, h) => {
    const { packagingRecyclingNotesRepository, logger } = request
    const { statuses, limit, cursor } = request.query

    try {
      const effectiveLimit = limit ?? DEFAULT_LIMIT

      const result = await packagingRecyclingNotesRepository.findByStatus({
        cursor,
        limit: effectiveLimit,
        statuses
      })

      const response = {
        items: result.items.map(mapToAdminPrn),
        hasMore: result.hasMore
      }

      if (result.nextCursor) {
        response.nextCursor = result.nextCursor
      }

      logger.info({
        message: `Admin listed ${result.items.length} PRNs`,
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
        message: `Failure on ${adminPackagingRecyclingNotesListPath}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        }
      })

      throw Boom.badImplementation(
        `Failure on ${adminPackagingRecyclingNotesListPath}`
      )
    }
  }
}
