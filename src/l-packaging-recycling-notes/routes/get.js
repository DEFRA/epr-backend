import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'

/** @typedef {import('#l-packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository */

export const packagingRecyclingNotesListPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/l-packaging-recycling-notes'

/**
 * Build response from PRN list
 * @param {import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote[]} prns
 */
const buildResponse = (prns) =>
  prns.map((prn) => ({
    id: prn.id,
    issuedToOrganisation: prn.issuedToOrganisation,
    tonnage: prn.tonnage,
    material: prn.material,
    status: prn.status.currentStatus,
    createdAt: prn.createdAt
  }))

export const packagingRecyclingNotesList = {
  method: 'GET',
  path: packagingRecyclingNotesListPath,
  options: {
    auth: getAuthConfig([ROLES.standardUser]),
    tags: ['api']
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {lumpyPackagingRecyclingNotesRepository: PackagingRecyclingNotesRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { lumpyPackagingRecyclingNotesRepository, params, logger } = request
    const { accreditationId } = params

    try {
      const prns =
        await lumpyPackagingRecyclingNotesRepository.findByAccreditation(
          accreditationId
        )

      logger.info({
        message: `PRNs listed for accreditation: ${accreditationId}, count=${prns.length}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: accreditationId
        }
      })

      return h.response(buildResponse(prns)).code(StatusCodes.OK)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        error,
        message: `Failure on ${packagingRecyclingNotesListPath}`,
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

      throw Boom.badImplementation(
        `Failure on ${packagingRecyclingNotesListPath}`
      )
    }
  }
}
