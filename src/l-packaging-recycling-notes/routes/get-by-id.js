import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { getProcessCode } from '#l-packaging-recycling-notes/domain/get-process-code.js'

/** @typedef {import('#l-packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository */

export const packagingRecyclingNoteByIdPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/l-packaging-recycling-notes/{prnId}'

/**
 * Build response from PRN
 * @param {import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} prn
 */
const buildResponse = (prn) => ({
  id: prn.id,
  prnNumber: prn.prnNumber ?? null,
  accreditationYear: prn.accreditationYear ?? null,
  issuedToOrganisation: prn.issuedToOrganisation,
  tonnage: prn.tonnage,
  material: prn.material,
  status: prn.status.currentStatus,
  createdAt: prn.createdAt,
  notes: prn.issuerNotes ?? null,
  isDecemberWaste: prn.isDecemberWaste ?? false,
  authorisedAt: prn.authorisedAt ?? null,
  authorisedBy: prn.authorisedBy ?? null,
  wasteProcessingType: prn.wasteProcessingType ?? null,
  processToBeUsed: getProcessCode(prn.material)
})

export const packagingRecyclingNoteById = {
  method: 'GET',
  path: packagingRecyclingNoteByIdPath,
  options: {
    auth: getAuthConfig([ROLES.standardUser]),
    tags: ['api']
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {lumpyPackagingRecyclingNotesRepository: PackagingRecyclingNotesRepository}} request
   * @param {object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const {
      lumpyPackagingRecyclingNotesRepository,
      params,
      logger /** @type {import('#common/hapi-types.js').TypedLogger} */
    } = request
    const { organisationId, accreditationId, prnId } = params

    try {
      const prn = await lumpyPackagingRecyclingNotesRepository.findById(prnId)

      if (!prn) {
        throw Boom.notFound('PRN not found')
      }

      // Verify the PRN belongs to the requested organisation and accreditation
      if (
        prn.issuedByOrganisation !== organisationId ||
        prn.issuedByAccreditation !== accreditationId
      ) {
        throw Boom.notFound('PRN not found')
      }

      logger.info({
        message: `PRN retrieved: id=${prnId}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: prnId
        }
      })

      return h.response(buildResponse(prn)).code(StatusCodes.OK)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        error,
        message: `Failure on ${packagingRecyclingNoteByIdPath}`,
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
        `Failure on ${packagingRecyclingNoteByIdPath}`
      )
    }
  }
}
