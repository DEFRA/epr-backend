import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'

/** @typedef {import('#repositories/packaging-recycling-notes/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository */

export const packagingRecyclingNotesListPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/packaging-recycling-notes'

/**
 * Build response from PRN list
 * @param {import('#domain/prn/model.js').PackagingRecyclingNote[]} prns
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
   * @param {import('#common/hapi-types.js').HapiRequest & {packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { packagingRecyclingNotesRepository, params, logger } = request
    const { registrationId } = params

    try {
      const prns =
        await packagingRecyclingNotesRepository.findByRegistration(
          registrationId
        )

      logger.info({
        message: `PRNs listed for registration: ${registrationId}, count=${prns.length}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: registrationId
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
