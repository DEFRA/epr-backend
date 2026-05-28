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
import { foldPrnFromTailEvents } from '#packaging-recycling-notes/application/fold-prn-from-tail-events.js'

/** @typedef {import('#packaging-recycling-notes/domain/model.js').GetPrnResponse} GetPrnResponse */
/** @typedef {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository */
/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('#waste-balances/repository/port.js').WasteBalancesRepository} WasteBalancesRepository */

export const packagingRecyclingNoteByIdPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/packaging-recycling-notes/{prnId}'

/**
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} prn
 * @param {{ wasteProcessingType: string }} accreditation
 * @returns {GetPrnResponse}
 */
const buildResponse = (prn, { wasteProcessingType }) => ({
  id: prn.id,
  accreditationYear: prn.accreditation.accreditationYear,
  createdAt: prn.createdAt,
  isDecemberWaste: prn.isDecemberWaste,
  issuedAt: prn.status.issued?.at ?? null,
  issuedBy: prn.status.issued?.by ?? null,
  issuedToOrganisation: prn.issuedToOrganisation,
  material: prn.accreditation.material,
  notes: prn.notes ?? null,
  prnNumber: prn.prnNumber ?? null,
  processToBeUsed: /** @type {string} */ (
    getProcessCode(prn.accreditation.material)
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
   * @param {import('#common/hapi-types.js').HapiRequest & {packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository, organisationsRepository: OrganisationsRepository, wasteBalancesRepository: WasteBalancesRepository}} request
   * @param {object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const {
      packagingRecyclingNotesRepository,
      organisationsRepository,
      wasteBalancesRepository,
      params,
      logger
    } = request
    const { organisationId, accreditationId, prnId } = params

    try {
      const [prn, accreditation] = await Promise.all([
        packagingRecyclingNotesRepository.findById(prnId),
        organisationsRepository.findAccreditationById(
          organisationId,
          accreditationId
        )
      ])

      if (
        !prn ||
        prn.organisation.id !== organisationId ||
        prn.accreditation.id !== accreditationId
      ) {
        throw Boom.notFound('PRN not found')
      }

      const tailEvents = await wasteBalancesRepository.getPrnCatchupEvents({
        registrationId: prn.registrationId,
        accreditationId: prn.accreditation.id,
        prnId: prn.id,
        afterEventNumber: prn.lastAppliedEventNumber ?? 0
      })
      const foldedPrn = foldPrnFromTailEvents(prn, tailEvents)

      if (foldedPrn.status.currentStatus === PRN_STATUS.DELETED) {
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

      return h
        .response(buildResponse(foldedPrn, accreditation))
        .code(StatusCodes.OK)
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
