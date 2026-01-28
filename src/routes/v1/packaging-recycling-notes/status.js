import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { PRN_STATUS, PRN_STATUS_TRANSITIONS } from '#domain/prn/model.js'

/** @typedef {import('#repositories/packaging-recycling-notes/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository */

export const packagingRecyclingNotesUpdateStatusPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/packaging-recycling-notes/{id}/status'

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
 * Validates that a status transition is allowed
 * @param {import('#domain/prn/model.js').PrnStatus} currentStatus
 * @param {import('#domain/prn/model.js').PrnStatus} newStatus
 * @returns {boolean}
 */
function isValidTransition(currentStatus, newStatus) {
  const allowedTransitions = PRN_STATUS_TRANSITIONS[currentStatus] || []
  return allowedTransitions.includes(newStatus)
}

/**
 * Build response from updated PRN
 * @param {import('#domain/prn/model.js').PackagingRecyclingNote} prn
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
        id: Joi.string().hex().length(24).required()
      }),
      payload: updateStatusPayloadSchema
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest<{status: import('#domain/prn/model.js').PrnStatus}> & {packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { packagingRecyclingNotesRepository, params, payload, logger, auth } =
      request
    const { organisationId, registrationId, id } = params
    const { status: newStatus } = payload
    const userId = auth.credentials?.profile?.id ?? 'unknown'
    const now = new Date()

    try {
      // Fetch existing PRN
      const prn = await packagingRecyclingNotesRepository.findById(id)

      if (!prn) {
        throw Boom.notFound(`PRN not found: ${id}`)
      }

      // Verify the PRN belongs to the requested organisation and registration
      if (
        prn.issuedByOrganisation !== organisationId ||
        prn.issuedByRegistration !== registrationId
      ) {
        throw Boom.notFound(`PRN not found: ${id}`)
      }

      // Validate status transition
      const currentStatus = prn.status.currentStatus
      if (!isValidTransition(currentStatus, newStatus)) {
        throw Boom.badRequest(
          `Invalid status transition: ${currentStatus} -> ${newStatus}`
        )
      }

      // Update status
      const updatedPrn = await packagingRecyclingNotesRepository.updateStatus({
        id,
        status: newStatus,
        updatedBy: userId,
        updatedAt: now
      })

      if (!updatedPrn) {
        throw Boom.badImplementation('Failed to update PRN status')
      }

      logger.info({
        message: `PRN status updated: id=${id}, ${currentStatus} -> ${newStatus}`,
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
