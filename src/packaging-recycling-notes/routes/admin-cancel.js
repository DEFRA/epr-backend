import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import {
  PRN_STATUS,
  PRN_ACTOR,
  StatusConflictError,
  UnauthorisedTransitionError
} from '#packaging-recycling-notes/domain/model.js'
import { RelevantYearWindowExpiredError } from '#packaging-recycling-notes/domain/relevant-year.js'
import { updatePrnStatus } from '#packaging-recycling-notes/application/update-status.js'
import { auditPrnStatusTransition } from '#packaging-recycling-notes/application/audit.js'
import { writeConflictRefusal } from './write-conflict-refusal.js'

/**
 * @import { PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js'
 * @import { HapiRequest, TypedLogger } from '#common/hapi-types.js'
 * @import { OnPrnCancelled } from '#reports/application/prn-cancellation-events.js'
 */

export const adminPackagingRecyclingNotesCancelPath =
  '/v1/admin/packaging-recycling-notes/{id}/cancel'

/**
 * Builds the acting user from admin request credentials. `HumanCredentials`
 * guarantees `id` and `email`, but `name` is optional — Entra admin tokens
 * carry no display name, so it falls back to the email to avoid stamping
 * `'unknown'` on the PRN's `status.cancelled.by` and the ledger event's
 * `createdBy` — the PRN actor summary (unlike the reports one) carries no
 * `position` field, so it is not set here; the admin's role is still
 * captured on the system log via `extractUserDetails`.
 *
 * @param {{ id: string, email: string, name?: string }} credentials
 */
const buildAdminUser = ({ id, email, name }) => ({
  id,
  name: name ?? email,
  email
})

/**
 * Statuses an admin can cancel a PRN/PERN from. `accepted` since PAE-1823;
 * `awaiting_acceptance` added for PAE-1859 so a note stranded awaiting the
 * recipient's response isn't stuck if they can't act on it.
 *
 * @type {Set<import('#packaging-recycling-notes/domain/model.js').PrnStatus>}
 */
const CANCELLABLE_STATUSES = new Set([
  PRN_STATUS.ACCEPTED,
  PRN_STATUS.AWAITING_ACCEPTANCE
])

/**
 * Fetches the PRN and confirms it is in a cancellable state, logging and
 * throwing the appropriate Boom error otherwise (404 if missing, 409 if not
 * `accepted` or `awaiting_acceptance`).
 *
 * @param {PackagingRecyclingNotesRepository} repository
 * @param {string} id
 * @param {TypedLogger} logger
 * @returns {Promise<*>} the cancellable PRN
 */
const findCancellablePrnOrThrow = async (repository, id, logger) => {
  const previousPrn = await repository.findById(id)

  if (!previousPrn) {
    logger.info({
      message: `Admin cancel refused: PRN not found: ${id}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.REQUEST_FAILURE,
        reference: id
      }
    })
    throw Boom.notFound(`PRN not found: ${id}`)
  }

  if (!CANCELLABLE_STATUSES.has(previousPrn.status.currentStatus)) {
    logger.info({
      message: `Admin cancel refused: PRN ${id} is ${previousPrn.status.currentStatus}, not cancellable`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.REQUEST_FAILURE,
        reference: id
      }
    })
    throw Boom.conflict(
      `Cannot cancel a PRN with status '${previousPrn.status.currentStatus}'; only an accepted or awaiting acceptance PRN can be cancelled`
    )
  }

  return previousPrn
}

/**
 * Transitions the given PRN to cancelled, audits the change, logs success and
 * builds the 200 response body.
 *
 * @param {HapiRequest & {
 *   packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository,
 *   prnEvents: { onCancelled: OnPrnCancelled }
 * }} request
 * @param {*} previousPrn
 * @param {string} id
 * @param {Object} h - Hapi response toolkit
 */
const performCancellation = async (request, previousPrn, id, h) => {
  const {
    packagingRecyclingNotesRepository,
    ledgerRepository,
    organisationsRepository,
    prnEvents,
    logger,
    auth
  } = request

  const user = buildAdminUser(
    /** @type {{ id: string, email: string, name?: string }} */ (
      auth.credentials
    )
  )

  const updatedPrn = await updatePrnStatus({
    prnRepository: packagingRecyclingNotesRepository,
    ledgerRepository,
    organisationsRepository,
    prnEvents,
    logger,
    id,
    organisationId: previousPrn.organisation.id,
    registrationId: previousPrn.registrationId,
    accreditationId: previousPrn.accreditation.id,
    newStatus: PRN_STATUS.CANCELLED,
    actor: PRN_ACTOR.SERVICE_MAINTAINER,
    user,
    providedPrn: previousPrn
  })

  await auditPrnStatusTransition(request, id, previousPrn, updatedPrn)

  logger.info({
    message: `Admin cancel succeeded: PRN ${id} is now cancelled`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
      reference: id
    }
  })

  return h
    .response({
      id: updatedPrn.id,
      prnNumber: updatedPrn.prnNumber,
      status: updatedPrn.status.currentStatus,
      tonnage: updatedPrn.tonnage,
      obligationYear: updatedPrn.obligationYear,
      updatedAt: updatedPrn.updatedAt
    })
    .code(StatusCodes.OK)
}

/**
 * Maps a cancellation failure to the HTTP error it should surface as.
 *
 * This handler checks the fetched document is `accepted` or
 * `awaiting_acceptance`, but the transition is ruled on again at the ledger
 * head against the PRN projected from the stream. The two disagree whenever
 * another writer has changed the PRN's status since, so a status conflict is
 * the ordinary refusal for a losing request rather than a broken invariant.
 *
 * @param {*} error
 * @param {string} path
 * @param {string} id
 * @param {TypedLogger} logger
 */
const mapAdminCancelError = (error, path, id, logger) => {
  const conflict = writeConflictRefusal(error)
  if (conflict) {
    return conflict
  }

  if (
    error instanceof StatusConflictError ||
    error instanceof UnauthorisedTransitionError
  ) {
    return Boom.conflict(error.message)
  }

  if (error instanceof RelevantYearWindowExpiredError) {
    logger.info({
      message: `Admin cancel refused: ${error.message}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.REQUEST_FAILURE,
        reference: id
      }
    })
    return Boom.conflict(error.message)
  }

  if (error.isBoom) {
    return error
  }

  logger.error({
    err: error,
    message: `Admin cancel failed unexpectedly: id=${id}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE,
      reference: id
    }
  })

  return Boom.badImplementation(`Failure on ${path}`)
}

export const adminPackagingRecyclingNotesCancel = {
  method: 'POST',
  path: adminPackagingRecyclingNotesCancelPath,
  options: {
    auth: getAuthConfig([SCOPES.adminWrite]),
    tags: ['api', 'admin'],
    validate: {
      params: Joi.object({
        id: Joi.string().hex().length(24).required()
      })
    }
  },
  /**
   * @param {HapiRequest & {
   *   packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository,
   *   params: { id: string },
   *   prnEvents: { onCancelled: OnPrnCancelled }
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { packagingRecyclingNotesRepository, params, logger } = request
    const { id } = params

    logger.info({
      message: `Admin cancel requested: id=${id}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
        reference: id
      }
    })

    try {
      const previousPrn = await findCancellablePrnOrThrow(
        packagingRecyclingNotesRepository,
        id,
        logger
      )

      return await performCancellation(request, previousPrn, id, h)
    } catch (error) {
      throw mapAdminCancelError(
        error,
        adminPackagingRecyclingNotesCancelPath,
        id,
        logger
      )
    }
  }
}
