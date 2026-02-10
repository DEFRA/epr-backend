import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import {
  PRN_ACTOR,
  StatusConflictError,
  UnauthorisedTransitionError
} from '#packaging-recycling-notes/domain/model.js'
import { updatePrnStatus } from '#packaging-recycling-notes/application/update-status.js'
import { auditPrnStatusTransition } from '#packaging-recycling-notes/application/audit.js'

/**
 * Creates a Hapi route handler for external PRN status transitions.
 *
 * @param {Object} options
 * @param {import('#packaging-recycling-notes/domain/model.js').PrnStatus} options.newStatus
 * @param {string} options.timestampField
 * @param {string} options.actionVerb
 * @param {string} options.path
 * @returns {{ handler: import('@hapi/hapi').Lifecycle.Method }}
 */
export function createExternalTransitionHandler({
  newStatus,
  timestampField,
  actionVerb,
  path
}) {
  return {
    handler: async (request, h) => {
      const {
        lumpyPackagingRecyclingNotesRepository,
        wasteBalancesRepository,
        organisationsRepository,
        params,
        payload,
        logger
      } = request
      const { prnNumber } = params

      try {
        const prn =
          await lumpyPackagingRecyclingNotesRepository.findByPrnNumber(
            prnNumber
          )

        if (!prn) {
          throw Boom.notFound(
            `Packaging recycling note not found: ${prnNumber}`
          )
        }

        const timestamp = payload?.[timestampField]
          ? new Date(payload[timestampField])
          : new Date()

        const user = request.auth.credentials

        const updatedPrn = await updatePrnStatus({
          prnRepository: lumpyPackagingRecyclingNotesRepository,
          wasteBalancesRepository,
          organisationsRepository,
          id: prn.id,
          organisationId: prn.organisation.id,
          accreditationId: prn.accreditation.id,
          newStatus,
          actor: PRN_ACTOR.PRODUCER,
          user,
          providedPrn: prn,
          updatedAt: timestamp
        })

        await auditPrnStatusTransition(request, prn.id, prn, updatedPrn)

        logger.info({
          message: `PRN ${actionVerb}: ${prnNumber}`,
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
            reference: prnNumber
          }
        })

        return h.response().code(StatusCodes.NO_CONTENT)
      } catch (error) {
        if (error instanceof StatusConflictError) {
          throw Boom.conflict(error.message)
        }

        if (error instanceof UnauthorisedTransitionError) {
          throw Boom.badRequest(error.message)
        }

        if (error.isBoom) {
          throw error
        }

        logger.error({
          err: error,
          message: `Failure on ${path}`,
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
          }
        })

        throw Boom.badImplementation(`Failure on ${path}`)
      }
    }
  }
}
