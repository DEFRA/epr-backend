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
import { getProjectedPrnByNumber } from '#packaging-recycling-notes/application/get-projected-prn.js'

/**
 * @import { Request, Lifecycle } from '@hapi/hapi'
 * @import { HapiRequest, MachineCredentials } from '#common/hapi-types.js'
 * @import { PrnStatus } from '#packaging-recycling-notes/domain/model.js'
 * @import { PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js'
 * @import { OnPrnCancelled } from '#reports/application/prn-cancellation-events.js'
 */

/**
 * @typedef {HapiRequest & {
 *   packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository,
 *   prnEvents: { onCancelled: OnPrnCancelled }
 * }} ExternalTransitionRequest
 */

/**
 * Resolves the transition timestamp from the payload, falling back to now,
 * and the acting user from the request's machine credentials.
 *
 * @param {ExternalTransitionRequest} request
 * @param {string} timestampField
 * @returns {{ timestamp: Date, user: { id: string, name: string } }}
 */
function resolveTransitionContext(request, timestampField) {
  const timestamp = request.payload?.[timestampField]
    ? new Date(request.payload[timestampField])
    : new Date()

  const { id, name } = /** @type {MachineCredentials} */ (
    request.auth.credentials
  )

  return { timestamp, user: { id, name } }
}

/**
 * Creates a Hapi route handler for external PRN status transitions.
 *
 * @param {Object} options
 * @param {PrnStatus} options.newStatus
 * @param {string} options.timestampField
 * @param {string} options.actionVerb
 * @param {string} options.path
 * @returns {{ handler: Lifecycle.Method }}
 */
export function createExternalTransitionHandler({
  newStatus,
  timestampField,
  actionVerb,
  path
}) {
  return {
    /** @param {Request} req */
    handler: async (req, h) => {
      const request = /** @type {ExternalTransitionRequest} */ (
        /** @type {unknown} */ (req)
      )
      const {
        packagingRecyclingNotesRepository,
        ledgerRepository,
        organisationsRepository,
        prnEvents,
        params,
        logger
      } = request
      const { prnNumber } = params

      try {
        const prn = await getProjectedPrnByNumber({
          packagingRecyclingNotesRepository,
          ledgerRepository,
          prnNumber
        })

        if (!prn) {
          throw Boom.notFound(
            `Packaging recycling note not found: ${prnNumber}`
          )
        }

        const { timestamp, user } = resolveTransitionContext(
          request,
          timestampField
        )

        const updatedPrn = await updatePrnStatus({
          prnRepository: packagingRecyclingNotesRepository,
          ledgerRepository,
          organisationsRepository,
          prnEvents,
          logger,
          id: prn.id,
          organisationId: prn.organisation.id,
          registrationId: prn.registrationId,
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
        throw mapTransitionError(error, path, logger)
      }
    }
  }
}

export function mapTransitionError(error, path, logger) {
  if (error instanceof StatusConflictError) {
    return Boom.conflict(error.message)
  }

  if (error instanceof UnauthorisedTransitionError) {
    return Boom.badRequest(error.message)
  }

  if (error.isBoom) {
    return error
  }

  logger.error({
    err: error,
    message: `Failure on ${path}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
    }
  })

  return Boom.badImplementation(`Failure on ${path}`)
}
