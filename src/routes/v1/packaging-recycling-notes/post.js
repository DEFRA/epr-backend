import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { PRN_STATUS } from '#domain/prn/model.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { packagingRecyclingNotesCreatePayloadSchema } from './post.schema.js'

/** @typedef {import('#repositories/packaging-recycling-notes/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository */

/**
 * @typedef {{
 *   issuedToOrganisation: string;
 *   tonnage: number;
 *   material: string;
 *   nation: string;
 *   wasteProcessingType: string;
 *   issuerNotes?: string;
 * }} PackagingRecyclingNotesCreatePayload
 */

export const packagingRecyclingNotesCreatePath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/packaging-recycling-notes'

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
   * @param {import('#common/hapi-types.js').HapiRequest<PackagingRecyclingNotesCreatePayload> & {packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { packagingRecyclingNotesRepository, params, payload, logger, auth } =
      request
    const { organisationId, registrationId } = params
    const {
      issuedToOrganisation,
      tonnage,
      material,
      nation,
      wasteProcessingType,
      issuerNotes
    } = payload

    const userId = auth.credentials?.profile?.id ?? 'unknown'
    const now = new Date()

    try {
      const prn = await packagingRecyclingNotesRepository.create({
        issuedByOrganisation: organisationId,
        issuedByRegistration: registrationId,
        issuedToOrganisation,
        tonnage,
        material,
        nation,
        wasteProcessingType,
        isExport: wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER,
        issuerNotes: issuerNotes || undefined,
        status: {
          currentStatus: PRN_STATUS.DRAFT,
          history: [
            {
              status: PRN_STATUS.DRAFT,
              updatedAt: now,
              updatedBy: userId
            }
          ]
        },
        createdAt: now,
        createdBy: userId,
        updatedAt: now
      })

      logger.info({
        message: `PRN created: id=${prn.id}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: prn.id
        }
      })

      return h
        .response({
          id: prn.id,
          tonnage: prn.tonnage,
          material: prn.material,
          issuedToOrganisation: prn.issuedToOrganisation,
          status: prn.status.currentStatus,
          createdAt: prn.createdAt
        })
        .code(StatusCodes.CREATED)
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
