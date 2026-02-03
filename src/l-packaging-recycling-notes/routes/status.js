import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import {
  PRN_STATUS,
  PRN_STATUS_TRANSITIONS
} from '#l-packaging-recycling-notes/domain/model.js'
import { generatePrnNumber } from '#l-packaging-recycling-notes/domain/prn-number-generator.js'
import { PrnNumberConflictError } from '#l-packaging-recycling-notes/repository/mongodb.js'

/** Suffixes A-Z for collision avoidance */
const COLLISION_SUFFIXES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/** @typedef {import('#l-packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository */
/** @typedef {import('#repositories/waste-balances/port.js').WasteBalancesRepository} WasteBalancesRepository */

export const packagingRecyclingNotesUpdateStatusPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/l-packaging-recycling-notes/{id}/status'

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
 * @param {import('#l-packaging-recycling-notes/domain/model.js').PrnStatus} currentStatus
 * @param {import('#l-packaging-recycling-notes/domain/model.js').PrnStatus} newStatus
 * @returns {boolean}
 */
function isValidTransition(currentStatus, newStatus) {
  const allowedTransitions = PRN_STATUS_TRANSITIONS[currentStatus] || []
  return allowedTransitions.includes(newStatus)
}

/**
 * Build response from updated PRN
 * @param {import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} prn
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

/**
 * Issues a PRN with retry logic for PRN number collisions.
 * Tries without suffix first, then A-Z on collision.
 *
 * @param {PackagingRecyclingNotesRepository} repository
 * @param {Object} updateParams - Parameters for updateStatus (id, status, updatedBy, updatedAt)
 * @param {Object} prnParams - Parameters for PRN number generation (nation, isExport)
 * @returns {Promise<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>}
 * @throws {Error} If all suffix attempts are exhausted
 */
async function issuePrnWithRetry(repository, updateParams, prnParams) {
  // Try without suffix first
  const suffixAttempts = [undefined, ...COLLISION_SUFFIXES]

  for (const suffix of suffixAttempts) {
    const prnNumber = generatePrnNumber({ ...prnParams, suffix })

    try {
      return await repository.updateStatus({
        ...updateParams,
        prnNumber
      })
    } catch (error) {
      if (error instanceof PrnNumberConflictError) {
        // Continue to next suffix
        continue
      }
      // Rethrow other errors
      throw error
    }
  }

  // All suffixes exhausted
  throw new Error('Unable to generate unique PRN number after all retries')
}

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
   * @param {import('#common/hapi-types.js').HapiRequest<{status: import('#l-packaging-recycling-notes/domain/model.js').PrnStatus}> & {lumpyPackagingRecyclingNotesRepository: PackagingRecyclingNotesRepository, wasteBalancesRepository: WasteBalancesRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const {
      lumpyPackagingRecyclingNotesRepository,
      wasteBalancesRepository,
      params,
      payload,
      logger,
      auth
    } = request
    const { organisationId, accreditationId, id } = params
    const { status: newStatus } = payload
    const userId = auth.credentials?.id ?? 'unknown'
    const now = new Date()

    try {
      // Fetch existing PRN
      const prn = await lumpyPackagingRecyclingNotesRepository.findById(id)

      if (!prn) {
        throw Boom.notFound(`PRN not found: ${id}`)
      }

      // Verify the PRN belongs to the requested organisation and accreditation
      if (
        prn.issuedByOrganisation !== organisationId ||
        prn.issuedByAccreditation !== accreditationId
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

      // Deduct available waste balance when creating PRN (transitioning to awaiting_authorisation)
      const isCreating = newStatus === PRN_STATUS.AWAITING_AUTHORISATION
      if (isCreating) {
        const balance =
          await wasteBalancesRepository.findByAccreditationId(accreditationId)
        if (balance) {
          await wasteBalancesRepository.deductAvailableBalanceForPrnCreation({
            accreditationId,
            organisationId,
            prnId: id,
            tonnage: prn.tonnage,
            userId
          })
        }
      }

      // Generate PRN number when issuing (transitioning to awaiting_acceptance)
      const isIssuing = newStatus === PRN_STATUS.AWAITING_ACCEPTANCE
      let updatedPrn

      if (isIssuing) {
        // Issue with collision retry logic
        updatedPrn = await issuePrnWithRetry(
          lumpyPackagingRecyclingNotesRepository,
          { id, status: newStatus, updatedBy: userId, updatedAt: now },
          { nation: prn.nation, isExport: prn.isExport }
        )
      } else {
        // Simple status update without PRN number
        updatedPrn = await lumpyPackagingRecyclingNotesRepository.updateStatus({
          id,
          status: newStatus,
          updatedBy: userId,
          updatedAt: now
        })
      }

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
