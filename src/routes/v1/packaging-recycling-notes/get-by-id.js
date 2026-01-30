import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'

/** @typedef {import('#repositories/packaging-recycling-notes/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository */
/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

export const packagingRecyclingNoteByIdPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/packaging-recycling-notes/{prnId}'

/**
 * Extract year from ISO date string
 * @param {string|undefined} isoDate
 * @returns {number|null}
 */
const extractYear = (isoDate) => {
  if (!isoDate) {
    return null
  }
  const date = new Date(isoDate)
  return Number.isNaN(date.getTime()) ? null : date.getFullYear()
}

/**
 * Build response from PRN
 * @param {import('#domain/prn/model.js').PackagingRecyclingNote} prn
 * @param {number|null} accreditationYear
 */
const buildResponse = (prn, accreditationYear) => ({
  id: prn.id,
  prnNumber: prn.prnNumber ?? null,
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
  accreditationYear
})

export const packagingRecyclingNoteById = {
  method: 'GET',
  path: packagingRecyclingNoteByIdPath,
  options: {
    auth: getAuthConfig([ROLES.standardUser]),
    tags: ['api']
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository, organisationsRepository: OrganisationsRepository}} request
   * @param {object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const {
      packagingRecyclingNotesRepository,
      organisationsRepository,
      params,
      logger
    } = request
    const { organisationId, prnId } = params

    try {
      const prn = await packagingRecyclingNotesRepository.findById(prnId)

      if (!prn) {
        throw Boom.notFound('PRN not found')
      }

      // Fetch accreditation to derive accreditationYear from validFrom
      const accreditation = prn.accreditationId
        ? await organisationsRepository.findAccreditationById(
            organisationId,
            prn.accreditationId
          )
        : null
      const accreditationYear = extractYear(accreditation?.validFrom)

      logger.info({
        message: `PRN retrieved: id=${prnId}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: prnId
        }
      })

      return h.response(buildResponse(prn, accreditationYear)).code(StatusCodes.OK)
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
