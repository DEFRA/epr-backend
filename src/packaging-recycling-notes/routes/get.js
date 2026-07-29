import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'

/** @import { HapiRequest } from '#common/hapi-types.js' */
/** @import { PackagingRecyclingNote } from '#packaging-recycling-notes/domain/model.js' */
/** @import { PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */

export const packagingRecyclingNotesListPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/packaging-recycling-notes'

/**
 * Build response from PRN list
 * @param {PackagingRecyclingNote[]} prns
 * @param {{ wasteProcessingType: string }} accreditation
 */
const buildResponse = (prns, { wasteProcessingType }) =>
  prns.map((prn) => ({
    id: prn.id,
    prnNumber: prn.prnNumber ?? null,
    issuedToOrganisation: prn.issuedToOrganisation,
    tonnage: prn.tonnage,
    material: prn.accreditation.material,
    status: prn.status.currentStatus,
    createdAt: prn.createdAt,
    issuedAt: prn.status.issued?.at ?? null,
    wasteProcessingType
  }))

export const packagingRecyclingNotesList = {
  method: 'GET',
  path: packagingRecyclingNotesListPath,
  options: {
    auth: getAuthConfig([SCOPES.organisationRead]),
    tags: ['api']
  },
  /**
   * @param {HapiRequest & {
   *   packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository,
   *   organisationsRepository: OrganisationsRepository,
   *   params: { organisationId: string, registrationId: string, accreditationId: string }
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const {
      packagingRecyclingNotesRepository,
      organisationsRepository,
      params,
      logger
    } = request
    const { organisationId, registrationId, accreditationId } = params

    try {
      const [prns, accreditation] = await Promise.all([
        packagingRecyclingNotesRepository.findByAccreditation({
          organisationId,
          registrationId,
          accreditationId
        }),
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
