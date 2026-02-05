import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { updatePrnStatus } from '#packaging-recycling-notes/application/update-status.js'

/** @typedef {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository */
/** @typedef {import('#repositories/waste-balances/port.js').WasteBalancesRepository} WasteBalancesRepository */

export const packagingRecyclingNotesUpdateStatusPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/packaging-recycling-notes/{id}/status'

const statusValues = Object.values(PRN_STATUS)

const updateStatusPayloadSchema = Joi.object({
  status: Joi.string()
    .valid(...statusValues)
    .required()
    .messages({
      'any.only': `Status must be one of: ${statusValues.join(', ')}`,
      'any.required': 'Status is required'
    })
})

/**
 * Build response from updated PRN
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} prn
 */
const buildResponse = (prn) => ({
  id: prn.id,
  prnNumber: prn.prnNumber,
  tonnage: prn.tonnage,
  material: prn.material,
  issuedToOrganisation: prn.issuedToOrganisation,
  status: prn.status.currentStatus,
  updatedAt: prn.updatedAt
})

export const packagingRecyclingNotesUpdateStatus = {
  method: 'POST',
  path: packagingRecyclingNotesUpdateStatusPath,
  options: {
    auth: getAuthConfig([ROLES.standardUser]),
    tags: ['api'],
    validate: {
      params: Joi.object({
        organisationId: Joi.string().required(),
        registrationId: Joi.string().required(),
        accreditationId: Joi.string().required(),
        id: Joi.string().hex().length(24).required()
      }),
      payload: updateStatusPayloadSchema
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest<{status: import('#packaging-recycling-notes/domain/model.js').PrnStatus}> & {lumpyPackagingRecyclingNotesRepository: PackagingRecyclingNotesRepository, wasteBalancesRepository: WasteBalancesRepository, organisationsRepository: import('#repositories/organisations/port.js').OrganisationsRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const {
      lumpyPackagingRecyclingNotesRepository,
      wasteBalancesRepository,
      organisationsRepository,
      params,
      payload,
      logger,
      auth
    } = request
    const { organisationId, accreditationId, id } = params
    const { status: newStatus } = payload
    const userId = auth.credentials?.id ?? 'unknown'

    try {
      const updatedPrn = await updatePrnStatus({
        prnRepository: lumpyPackagingRecyclingNotesRepository,
        wasteBalancesRepository,
        organisationsRepository,
        id,
        organisationId,
        accreditationId,
        newStatus,
        userId
      })

      logger.info({
        message: `PRN status updated: id=${id}, -> ${newStatus}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: id
        }
      })

      return h.response(buildResponse(updatedPrn)).code(StatusCodes.OK)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        error,
        message: `Failure on ${packagingRecyclingNotesUpdateStatusPath}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        }
      })

      throw Boom.badImplementation(
        `Failure on ${packagingRecyclingNotesUpdateStatusPath}`
      )
    }
  }
}
