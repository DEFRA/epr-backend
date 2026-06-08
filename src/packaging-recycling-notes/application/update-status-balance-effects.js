import Boom from '@hapi/boom'

import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import { STREAM_EVENT_KIND } from '#waste-balances/repository/stream-schema.js'

/**
 * @typedef {import('#waste-balances/repository/port.js').WasteBalancesRepository} WasteBalancesRepository
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PrnStatus} PrnStatus
 * @typedef {import('#waste-balances/repository/stream-schema.js').StreamEventKind} StreamEventKind
 */

/**
 * Payload carried by a balance event — what the stream append needs and what
 * the logger needs for ops correlation. `currentStatus`/`newStatus` are
 * transition metadata preserved for logging only.
 *
 * @typedef {Object} BalanceEventParams
 * @property {PrnStatus} currentStatus
 * @property {PrnStatus} newStatus
 * @property {string} accreditationId
 * @property {string} registrationId
 * @property {string} organisationId
 * @property {string} prnId
 * @property {number} tonnage
 * @property {import('#waste-balances/repository/stream-schema.js').StreamUserSummary} createdBy
 */

/**
 * @typedef {Object} BalanceEvent
 * @property {StreamEventKind} kind
 * @property {BalanceEventParams} params
 */

/**
 * Deducts available waste balance when creating a PRN.
 *
 * @param {WasteBalancesRepository} wasteBalancesRepository
 * @param {Object} params
 */
export async function deductWasteBalanceIfNeeded(
  wasteBalancesRepository,
  params
) {
  const {
    accreditationId,
    registrationId,
    organisationId,
    prnId,
    tonnage,
    createdBy
  } = params
  const balance =
    await wasteBalancesRepository.findByAccreditationId(accreditationId)

  if (balance) {
    if ((balance.availableAmount ?? 0) < tonnage) {
      throw Boom.conflict('Insufficient available waste balance')
    }

    return wasteBalancesRepository.deductAvailableBalanceForPrnCreation({
      accreditationId,
      registrationId,
      organisationId,
      prnId,
      tonnage,
      createdBy
    })
  } else {
    throw Boom.badRequest(
      `No waste balance found for accreditation: ${accreditationId}`
    )
  }
}

/**
 * Deducts total waste balance when issuing a PRN.
 *
 * @param {WasteBalancesRepository} wasteBalancesRepository
 * @param {Object} params
 */
export async function deductTotalBalanceIfNeeded(
  wasteBalancesRepository,
  params
) {
  const {
    accreditationId,
    registrationId,
    organisationId,
    prnId,
    tonnage,
    createdBy
  } = params
  const balance =
    await wasteBalancesRepository.findByAccreditationId(accreditationId)

  if (balance) {
    if ((balance.amount ?? 0) < tonnage) {
      throw Boom.conflict('Insufficient total waste balance')
    }

    return wasteBalancesRepository.deductTotalBalanceForPrnIssue({
      accreditationId,
      registrationId,
      organisationId,
      prnId,
      tonnage,
      createdBy
    })
  } else {
    throw Boom.badRequest(
      `No waste balance found for accreditation: ${accreditationId}`
    )
  }
}

/**
 * Credits available waste balance when cancelling a PRN from awaiting_authorisation.
 * Reverses the ringfencing that occurred when the PRN was created.
 *
 * @param {WasteBalancesRepository} wasteBalancesRepository
 * @param {Object} params
 */
export async function creditWasteBalanceIfNeeded(
  wasteBalancesRepository,
  params
) {
  const {
    accreditationId,
    registrationId,
    organisationId,
    prnId,
    tonnage,
    createdBy
  } = params
  const balance =
    await wasteBalancesRepository.findByAccreditationId(accreditationId)

  if (balance) {
    return wasteBalancesRepository.creditAvailableBalanceForPrnCancellation({
      accreditationId,
      registrationId,
      organisationId,
      prnId,
      tonnage,
      createdBy
    })
  } else {
    throw Boom.badRequest(
      `No waste balance found for accreditation: ${accreditationId}`
    )
  }
}

/**
 * Credits both amount and availableAmount when cancelling an issued PRN.
 * Reverses both the creation ringfence and the issue deduction.
 *
 * @param {WasteBalancesRepository} wasteBalancesRepository
 * @param {Object} params
 */
export async function creditFullBalanceIfNeeded(
  wasteBalancesRepository,
  params
) {
  const {
    accreditationId,
    registrationId,
    organisationId,
    prnId,
    tonnage,
    createdBy
  } = params
  const balance =
    await wasteBalancesRepository.findByAccreditationId(accreditationId)

  if (balance) {
    return wasteBalancesRepository.creditFullBalanceForIssuedPrnCancellation({
      accreditationId,
      registrationId,
      organisationId,
      prnId,
      tonnage,
      createdBy
    })
  } else {
    throw Boom.badRequest(
      `No waste balance found for accreditation: ${accreditationId}`
    )
  }
}

/**
 * Operational system log capturing that a waste balance write committed.
 *
 * @param {import('#common/hapi-types.js').TypedLogger} logger
 * @param {string} operation
 * @param {string} prnId
 * @param {number} tonnage
 * @param {string} fromStatus
 * @param {string} toStatus
 */
export function logWasteBalanceUpdate(
  logger,
  operation,
  prnId,
  tonnage,
  fromStatus,
  toStatus
) {
  logger.info({
    message: `Waste balance ${operation} for PRN ${prnId} (${fromStatus} -> ${toStatus}), tonnage ${tonnage}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.DB,
      action: LOGGING_EVENT_ACTIONS.WASTE_BALANCE_UPDATED,
      reference: prnId
    }
  })
}

/**
 * Transition table keyed by `${currentStatus}|${newStatus}`. Each entry names
 * the stream event kind the transition writes. Transitions without an entry
 * have no balance effect. Keys must be transitions the state machine
 * (`PRN_STATUS_TRANSITIONS`) actually permits.
 *
 * @type {Record<string, StreamEventKind>}
 */
const TRANSITION_TO_EVENT_KIND = Object.freeze({
  [`${PRN_STATUS.DRAFT}|${PRN_STATUS.AWAITING_AUTHORISATION}`]:
    STREAM_EVENT_KIND.PRN_CREATED,
  [`${PRN_STATUS.AWAITING_AUTHORISATION}|${PRN_STATUS.AWAITING_ACCEPTANCE}`]:
    STREAM_EVENT_KIND.PRN_ISSUED,
  [`${PRN_STATUS.AWAITING_ACCEPTANCE}|${PRN_STATUS.ACCEPTED}`]:
    STREAM_EVENT_KIND.PRN_ACCEPTED,
  [`${PRN_STATUS.AWAITING_ACCEPTANCE}|${PRN_STATUS.AWAITING_CANCELLATION}`]:
    STREAM_EVENT_KIND.PRN_REJECTED,
  [`${PRN_STATUS.AWAITING_AUTHORISATION}|${PRN_STATUS.DELETED}`]:
    STREAM_EVENT_KIND.PRN_CREATION_CANCELLED,
  [`${PRN_STATUS.AWAITING_CANCELLATION}|${PRN_STATUS.CANCELLED}`]:
    STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE
})

/**
 * Derives the balance events a status transition would write. An empty array
 * means the transition has no balance effect — callers use that to skip the
 * stream-write decision read entirely. The kinds align with `STREAM_EVENT_KIND`
 * so the live-write path, backfill, and the stream itself share one vocabulary.
 *
 * @param {PrnStatus} currentStatus
 * @param {PrnStatus} newStatus
 * @param {BalanceEventParams} params
 * @returns {BalanceEvent[]}
 */
export function balanceEventsFor(currentStatus, newStatus, params) {
  const kind = TRANSITION_TO_EVENT_KIND[`${currentStatus}|${newStatus}`]
  return kind ? [{ kind, params }] : []
}

/**
 * Append a status-only stream event (PRN_ACCEPTED, PRN_REJECTED). No balance
 * change; the repository method throws loudly if no balance exists.
 *
 * @param {import('#waste-balances/repository/stream-schema.js').StreamEventKind} streamKind
 */
const appendStatusOnlyStreamEvent =
  (streamKind) => async (wasteBalancesRepository, params) =>
    wasteBalancesRepository.appendStreamEvent({
      ...params,
      streamKind
    })

/**
 * Per-kind dispatch: each kind pairs an effect handler with its log-operation
 * label. Balance-affecting kinds append a balance movement to the stream;
 * status-only kinds (PRN_ACCEPTED, PRN_REJECTED) append a status event with no
 * balance change.
 */
const EFFECT_HANDLERS = Object.freeze({
  [STREAM_EVENT_KIND.PRN_CREATED]: {
    apply: deductWasteBalanceIfNeeded,
    logOperation: 'deduct_available'
  },
  [STREAM_EVENT_KIND.PRN_ISSUED]: {
    apply: deductTotalBalanceIfNeeded,
    logOperation: 'deduct_total'
  },
  [STREAM_EVENT_KIND.PRN_ACCEPTED]: {
    apply: appendStatusOnlyStreamEvent(STREAM_EVENT_KIND.PRN_ACCEPTED),
    logOperation: 'append_accepted'
  },
  [STREAM_EVENT_KIND.PRN_REJECTED]: {
    apply: appendStatusOnlyStreamEvent(STREAM_EVENT_KIND.PRN_REJECTED),
    logOperation: 'append_rejected'
  },
  [STREAM_EVENT_KIND.PRN_CREATION_CANCELLED]: {
    apply: creditWasteBalanceIfNeeded,
    logOperation: 'credit_available'
  },
  [STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE]: {
    apply: creditFullBalanceIfNeeded,
    logOperation: 'credit_full'
  }
})

/**
 * Applies the balance events for a status transition, appending one stream
 * event per input event and returning them in order. Each handler appends to
 * the stream or throws.
 *
 * @param {WasteBalancesRepository} wasteBalancesRepository
 * @param {import('#common/hapi-types.js').TypedLogger} logger
 * @param {BalanceEvent[]} events
 * @returns {Promise<Array<import('#waste-balances/repository/stream-port.js').StreamEvent>>}
 */
export async function applyWasteBalanceEffects(
  wasteBalancesRepository,
  logger,
  events
) {
  const applied = []
  for (const event of events) {
    const handler = EFFECT_HANDLERS[event.kind]
    const { currentStatus, newStatus, ...balanceParams } = event.params
    const streamEvent = await handler.apply(
      wasteBalancesRepository,
      balanceParams
    )
    applied.push(streamEvent)
    logWasteBalanceUpdate(
      logger,
      handler.logOperation,
      balanceParams.prnId,
      balanceParams.tonnage,
      currentStatus,
      newStatus
    )
  }
  return applied
}
