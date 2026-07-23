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

export const adminAccreditationPackagingRecyclingNotesListPath =
  '/v1/admin/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/packaging-recycling-notes'

export const adminAccreditationPackagingRecyclingNotesList = {
  method: 'GET',
  path: adminAccreditationPackagingRecyclingNotesListPath,
  options: {
    auth: getAuthConfig([SCOPES.adminRead]),
    tags: ['api', 'admin'],
    validate: {
      query: Joi.object({
        statuses: createStatusesValidator(Object.values(PRN_STATUS))
      })
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {
   *   packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository,
   *   query: { statuses: PrnStatus[] }
   * }} request
   */
  handler: async (request, h) => {
    const { packagingRecyclingNotesRepository, logger, params } = request
    const { organisationId, registrationId, accreditationId } = params
    const { statuses } = request.query

    try {
      // The PRNs of one accreditation are few, so the whole set is read and the
      // status filter applied in memory. The global list keeps cursor pagination.
      const prns = await packagingRecyclingNotesRepository.findByAccreditation({
        organisationId,
        registrationId,
        accreditationId
      })

      const items = prns
        .filter((prn) => statuses.includes(prn.status.currentStatus))
        .map(mapToAdminPrn)

      logger.info({
        message: `Admin listed ${items.length} PRNs for accreditation ${accreditationId}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: accreditationId
        }
      })

      return h.response({ items, hasMore: false }).code(StatusCodes.OK)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        err: error,
        message: `Failure on ${adminAccreditationPackagingRecyclingNotesListPath}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        }
      })

      throw Boom.badImplementation(
        `Failure on ${adminAccreditationPackagingRecyclingNotesListPath}`
      )
    }
  }
}
