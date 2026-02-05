import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { PRN_STATUS } from '#l-packaging-recycling-notes/domain/model.js'
import {
  WASTE_PROCESSING_TYPE,
  REGULATOR,
  NATION
} from '#domain/organisations/model.js'
import { getProcessCode } from '#l-packaging-recycling-notes/domain/get-process-code.js'
import { packagingRecyclingNotesCreatePayloadSchema } from './post.schema.js'

/** @typedef {import('#l-packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository */
/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

/**
 * @typedef {{
 *   issuedToOrganisation: string;
 *   tonnage: number;
 *   material: string;
 *   wasteProcessingType: string;
 *   issuerNotes?: string;
 * }} PackagingRecyclingNotesCreatePayload
 */

export const packagingRecyclingNotesCreatePath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/l-packaging-recycling-notes'

/**
 * Maps regulator to nation for PRN number generation.
 * TODO: Remove when Defra-p5c0 updates generator to use regulator directly.
 */
const REGULATOR_TO_NATION = Object.freeze({
  [REGULATOR.EA]: NATION.ENGLAND,
  [REGULATOR.SEPA]: NATION.SCOTLAND,
  [REGULATOR.NRW]: NATION.WALES,
  [REGULATOR.NIEA]: NATION.NORTHERN_IRELAND
})

/**
 * Build PRN data for creation
 * @param {Object} params
 * @param {string} params.organisationId
 * @param {string} params.accreditationId
 * @param {number} params.accreditationYear
 * @param {string} params.regulator
 * @param {PackagingRecyclingNotesCreatePayload} params.payload
 * @param {string} params.userId
 * @param {Date} params.now
 */
const buildPrnData = ({
  organisationId,
  accreditationId,
  accreditationYear,
  regulator,
  payload,
  userId,
  now
}) => ({
  accreditationYear,
  issuedByOrganisation: organisationId,
  issuedByAccreditation: accreditationId,
  issuedToOrganisation: payload.issuedToOrganisation,
  tonnage: payload.tonnage,
  material: payload.material,
  regulator,
  nation: REGULATOR_TO_NATION[regulator],
  wasteProcessingType: payload.wasteProcessingType,
  isExport: payload.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER,
  issuerNotes: payload.issuerNotes || undefined,
  status: {
    currentStatus: PRN_STATUS.DRAFT,
    history: [{ status: PRN_STATUS.DRAFT, updatedAt: now, updatedBy: userId }]
  },
  createdAt: now,
  createdBy: userId,
  updatedAt: now
})

/**
 * Build response from created PRN
 * @param {Object} prn
 */
const buildResponse = (prn) => ({
  id: prn.id,
  tonnage: prn.tonnage,
  material: prn.material,
  issuedToOrganisation: prn.issuedToOrganisation,
  status: prn.status.currentStatus,
  createdAt: prn.createdAt,
  processToBeUsed: getProcessCode(prn.material)
})

export const packagingRecyclingNotesCreate = {
  method: 'POST',
  path: packagingRecyclingNotesCreatePath,
  options: {
    auth: getAuthConfig([ROLES.standardUser]),
    tags: ['api'],
    validate: {
      payload: packagingRecyclingNotesCreatePayloadSchema
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest<PackagingRecyclingNotesCreatePayload> & {lumpyPackagingRecyclingNotesRepository: PackagingRecyclingNotesRepository, organisationsRepository: OrganisationsRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const {
      lumpyPackagingRecyclingNotesRepository,
      organisationsRepository,
      params,
      payload,
      logger,
      auth
    } = request
    const { organisationId, accreditationId } = params
    const userId = auth.credentials?.id ?? 'unknown'
    const now = new Date()

    try {
      const accreditation = await organisationsRepository.findAccreditationById(
        organisationId,
        accreditationId
      )

      if (!accreditation?.validFrom) {
        throw Boom.notFound('Accreditation not found')
      }

      const accreditationYear = parseInt(
        accreditation.validFrom.slice(0, 4),
        10
      )
      const regulator = accreditation.submittedToRegulator

      const prnData = buildPrnData({
        organisationId,
        accreditationId,
        accreditationYear,
        regulator,
        payload,
        userId,
        now
      })
      const prn = await lumpyPackagingRecyclingNotesRepository.create(prnData)

      logger.info({
        message: `PRN created: id=${prn.id}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: prn.id
        }
      })

      return h.response(buildResponse(prn)).code(StatusCodes.CREATED)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        error,
        message: `Failure on ${packagingRecyclingNotesCreatePath}`,
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
        `Failure on ${packagingRecyclingNotesCreatePath}`
      )
    }
  }
}
