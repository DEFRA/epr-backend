import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { getProcessCode } from '#packaging-recycling-notes/domain/get-process-code.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { packagingRecyclingNotesCreatePayloadSchema } from './post.schema.js'

/** @typedef {import('#packaging-recycling-notes/domain/model.js').CreatePrnResponse} CreatePrnResponse */
/** @typedef {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository */
/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

/**
 * @typedef {{
 *   issuedToOrganisation: { id: string; name: string; tradingName?: string };
 *   tonnage: number;
 *   material: string;
 *   notes?: string;
 * }} PackagingRecyclingNotesCreatePayload
 */

export const packagingRecyclingNotesCreatePath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/packaging-recycling-notes'

/**
 * Build PRN data for creation
 * @param {Object} params
 * @param {string} params.organisationId
 * @param {string} params.accreditationId
 * @param {PackagingRecyclingNotesCreatePayload} params.payload
 * @param {{ id: string; name: string }} params.user
 * @param {boolean} params.isExport
 * @param {Date} params.now
 */
const buildPrnData = ({
  organisationId,
  accreditationId,
  payload,
  user,
  isExport,
  now
}) => ({
  schemaVersion: 1,
  organisationId,
  accreditationId,
  issuedToOrganisation: payload.issuedToOrganisation,
  tonnage: payload.tonnage,
  material: payload.material,
  isExport,
  notes: payload.notes || undefined,
  isDecemberWaste: false,
  accreditationYear: 2026,
  issuedAt: null,
  issuedBy: null,
  status: {
    currentStatus: PRN_STATUS.DRAFT,
    history: [{ status: PRN_STATUS.DRAFT, updatedAt: now, updatedBy: user }]
  },
  createdAt: now,
  createdBy: user,
  updatedAt: now,
  updatedBy: user
})

/**
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} prn
 * @param {{ wasteProcessingType: string }} accreditation
 * @returns {CreatePrnResponse}
 */
const buildResponse = (prn, { wasteProcessingType }) => ({
  id: prn.id,
  accreditationYear: prn.accreditationYear ?? null,
  createdAt: prn.createdAt,
  isDecemberWaste: prn.isDecemberWaste ?? false,
  issuedToOrganisation: prn.issuedToOrganisation,
  material: prn.material,
  notes: prn.notes ?? null,
  processToBeUsed: getProcessCode(prn.material),
  status: prn.status.currentStatus,
  tonnage: prn.tonnage,
  wasteProcessingType
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
      logger /** @type {import('#common/hapi-types.js').TypedLogger} */,
      auth
    } = request
    const { organisationId, accreditationId } = params
    const user = {
      id: auth.credentials?.id ?? 'unknown',
      name: auth.credentials?.name ?? 'unknown'
    }
    const now = new Date()

    try {
      const accreditation = await organisationsRepository.findAccreditationById(
        organisationId,
        accreditationId
      )
      const isExport =
        accreditation.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER

      const prnData = buildPrnData({
        organisationId,
        accreditationId,
        payload,
        user,
        isExport,
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

      return h
        .response(buildResponse(prn, accreditation))
        .code(StatusCodes.CREATED)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        err: error,
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
