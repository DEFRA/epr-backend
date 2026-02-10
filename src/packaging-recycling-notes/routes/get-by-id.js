import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { getProcessCode } from '#packaging-recycling-notes/domain/get-process-code.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'

/** @typedef {import('#packaging-recycling-notes/domain/model.js').GetPrnResponse} GetPrnResponse */
/** @typedef {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository */
/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

export const packagingRecyclingNoteByIdPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/packaging-recycling-notes/{prnId}'

/**
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} prn
 * @param {{ wasteProcessingType: string }} accreditation
 * @returns {GetPrnResponse}
 */
const buildResponse = (prn, { wasteProcessingType }) => ({
  id: prn.id,
  accreditationYear: prn.accreditation?.accreditationYear ?? null,
  createdAt: prn.createdAt,
  isDecemberWaste: prn.isDecemberWaste ?? false,
  issuedAt: prn.status.issued?.at ?? null,
  issuedBy: prn.status.issued?.by ?? null,
  issuedToOrganisation: prn.issuedToOrganisation,
  material: prn.accreditation?.material,
  notes: prn.notes ?? null,
  prnNumber: prn.prnNumber ?? null,
  processToBeUsed: /** @type {string} */ (
    getProcessCode(prn.accreditation?.material)
  ),
  status: prn.status.currentStatus,
  tonnage: prn.tonnage,
  wasteProcessingType
})

export const packagingRecyclingNoteById = {
  method: 'GET',
  path: packagingRecyclingNoteByIdPath,
  options: {
    auth: getAuthConfig([ROLES.standardUser]),
    tags: ['api']
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {lumpyPackagingRecyclingNotesRepository: PackagingRecyclingNotesRepository, organisationsRepository: OrganisationsRepository}} request
   * @param {object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const {
      lumpyPackagingRecyclingNotesRepository,
      organisationsRepository,
      params,
      logger
    } = request
    const { organisationId, accreditationId, prnId } = params

    try {
      const [prn, accreditation] = await Promise.all([
        lumpyPackagingRecyclingNotesRepository.findById(prnId),
        organisationsRepository.findAccreditationById(
          organisationId,
          accreditationId
        )
      ])

      // Verify the PRN exists, belongs to the requested organisation/accreditation,
      // and treat deleted PRNs as not found (soft delete)
      if (
        !prn ||
        prn.organisation?.id !== organisationId ||
        prn.accreditation?.id !== accreditationId ||
        prn.status.currentStatus === PRN_STATUS.DELETED
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

      return h.response(buildResponse(prn, accreditation)).code(StatusCodes.OK)
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
