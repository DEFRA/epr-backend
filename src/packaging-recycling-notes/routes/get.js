import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'

/** @typedef {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository */
/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

export const packagingRecyclingNotesListPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/packaging-recycling-notes'

/**
 * Build response from PRN list
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote[]} prns
 * @param {{ wasteProcessingType: string }} accreditation
 */
const buildResponse = (prns, { wasteProcessingType }) =>
  prns.map((prn) => ({
    id: prn.id,
    prnNumber: prn.prnNumber ?? null,
    issuedToOrganisation: prn.issuedToOrganisation,
    tonnage: prn.tonnage,
    material: prn.accreditation?.material,
    status: prn.status.currentStatus,
    createdAt: prn.createdAt,
    issuedAt: prn.status.issued?.at ?? null,
    wasteProcessingType
  }))

export const packagingRecyclingNotesList = {
  method: 'GET',
  path: packagingRecyclingNotesListPath,
  options: {
    auth: getAuthConfig([ROLES.standardUser]),
    tags: ['api']
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository, organisationsRepository: OrganisationsRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const {
      packagingRecyclingNotesRepository,
      organisationsRepository,
      params,
      logger
    } = request
    const { organisationId, accreditationId } = params

    try {
      const [prns, accreditation] = await Promise.all([
        packagingRecyclingNotesRepository.findByAccreditation(accreditationId),
        organisationsRepository.findAccreditationById(
          organisationId,
          accreditationId
        )
      ])

      logger.info({
        message: `PRNs listed for accreditation: ${accreditationId}, count=${prns.length}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: accreditationId
        }
      })

      return h.response(buildResponse(prns, accreditation)).code(StatusCodes.OK)
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
