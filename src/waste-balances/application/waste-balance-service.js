import Boom from '@hapi/boom'

import {
  submitSummaryLog as decideSummaryLog,
  createPrn as decideCreatePrn,
  issuePrn as decideIssuePrn,
  cancelPrnCreation as decideCancelPrnCreation,
  cancelIssuedPrn as decideCancelIssuedPrn,
  acceptPrn as decideAcceptPrn,
  rejectPrn as decideRejectPrn,
  PRN_COMMAND_STATUS,
  PRN_COMMAND_REJECTION
} from '../domain/commands.js'
import { currentWasteBalance } from './current-waste-balance.js'
import { validateAccreditationId } from '../repository/validation.js'

/**
 * The outcome of a PRN command: the appended stream events when it commits, or
 * the reason it did not. The application layer turns a rejection into the
 * contextual error its callers expect.
 *
 * @typedef {{ status: 'committed', events: import('../repository/stream-port.js').StreamEvent[] }
 *   | { status: 'rejected', reason: import('../domain/commands.js').PrnCommandRejection }} PrnCommandResult
 */

/**
 * The ledger command machinery, sharing one captured stream repository: fold
 * the ledger into decidable state, append decided events, and run a PRN command
 * end to end. The service surface is assembled from these.
 *
 * @param {import('../repository/stream-port.js').WasteBalanceStreamRepository} streamRepository
 */
const createLedgerCommands = (streamRepository) => {
  /**
   * Fold the ledger into the state a command decides against, plus the head the
   * decision is made at.
   *
   * @param {import('../repository/stream-schema.js').WasteBalanceLedgerId} ledgerId
   * @returns {Promise<{ state: import('../domain/commands.js').LedgerState | null, head: number }>}
   */
  const fold = async (ledgerId) => {
    const balance = await currentWasteBalance(streamRepository, ledgerId)
    if (!balance) {
      return { state: null, head: 0 }
    }
    return {
      state: {
        balance: {
          amount: balance.amount,
          availableAmount: balance.availableAmount
        },
        creditTotal: balance.creditTotal
      },
      head: balance.eventNumber
    }
  }

  /**
   * Append the decided balance events to the ledger as one batch, stamping
   * each with the ledger identity, its slot, and provenance.
   *
   * @param {import('../repository/stream-schema.js').WasteBalanceLedgerId} ledgerId
   * @param {number} head
   * @param {import('../domain/commands.js').BalanceEvent[]} events
   * @param {import('../repository/stream-schema.js').StreamUserSummary} createdBy
   * @returns {Promise<import('../repository/stream-port.js').StreamEvent[]>}
   */
  const append = (ledgerId, head, events, createdBy) => {
    const createdAt = new Date()
    return streamRepository.bulkAppendEvents(
      events.map((event, index) => ({
        ...ledgerId,
        number: head + index + 1,
        kind: event.kind,
        payload: event.payload,
        openingBalance: event.openingBalance,
        closingBalance: event.closingBalance,
        createdAt,
        createdBy
      }))
    )
  }

  /**
   * Run a PRN command: assert the positive-amount invariant the pure decider
   * trusts, fold the ledger, reject when it does not exist yet (PRN commands
   * always act on an open ledger), run the pure decider, and append the decided
   * events when it commits. The amount guard and the no-ledger rejection both
   * live here, in one place, rather than in each decider.
   *
   * A non-positive amount is a broken invariant, not a client error: the PRN's
   * tonnage is validated positive at the HTTP route and the PRN repository
   * schema, so anything reaching this boundary is internal corruption and
   * surfaces as a 500 the platform logs and alerts on, rather than slipping past
   * the deciders' `<` sufficiency check to inflate the balance.
   *
   * @param {(balance: import('../repository/stream-schema.js').StreamBalanceSnapshot, payload: import('../repository/stream-schema.js').PrnPayload) => import('../domain/commands.js').PrnDecision} decide
   * @returns {(ledgerId: import('../repository/stream-schema.js').WasteBalanceLedgerId, payload: import('../repository/stream-schema.js').PrnPayload, createdBy: import('../repository/stream-schema.js').StreamUserSummary) => Promise<PrnCommandResult>}
   */
  const runPrnCommand = (decide) => async (ledgerId, payload, createdBy) => {
    if (!(payload.amount > 0)) {
      throw Boom.badImplementation(
        `PRN amount must be positive at the waste-balance write boundary; received ${payload.amount}`
      )
    }

    const { state, head } = await fold(ledgerId)
    if (!state) {
      return {
        status: PRN_COMMAND_STATUS.REJECTED,
        reason: PRN_COMMAND_REJECTION.NO_LEDGER
      }
    }

    const decision = decide(state.balance, payload)
    if (decision.status === PRN_COMMAND_STATUS.REJECTED) {
      return decision
    }

    return {
      status: PRN_COMMAND_STATUS.COMMITTED,
      events: await append(ledgerId, head, decision.events, createdBy)
    }
  }

  return { fold, append, runPrnCommand }
}

/**
 * The single application boundary over the waste balance ledger. Each command
 * folds the ledger once, runs the pure command core against that state, and
 * appends the returned event(s) at the next slot over the event store. The slot
 * index is the optimistic-concurrency guard: a head that moved after the fold
 * leaves the next slot occupied, so the append rejects with a
 * `StreamSlotConflictError` and the conflict surfaces to the caller — no
 * in-process retry (ADR-0036).
 *
 * @param {import('../repository/stream-port.js').WasteBalanceStreamRepository} streamRepository
 */
export const createWasteBalanceService = (streamRepository) => {
  const { fold, append, runPrnCommand } = createLedgerCommands(streamRepository)

  return {
    /**
     * Record a summary-log submission against the ledger.
     *
     * @param {import('../repository/stream-schema.js').WasteBalanceLedgerId} ledgerId
     * @param {import('../repository/stream-schema.js').SummaryLogSubmittedPayload} submission
     * @param {import('../repository/stream-schema.js').StreamUserSummary} createdBy
     * @returns {Promise<import('../repository/stream-port.js').StreamEvent[]>}
     */
    submitSummaryLog: async (ledgerId, submission, createdBy) => {
      const { state, head } = await fold(ledgerId)
      return append(
        ledgerId,
        head,
        decideSummaryLog(state, submission),
        createdBy
      )
    },

    createPrn: runPrnCommand(decideCreatePrn),
    issuePrn: runPrnCommand(decideIssuePrn),
    cancelPrnCreation: runPrnCommand(decideCancelPrnCreation),
    cancelIssuedPrn: runPrnCommand(decideCancelIssuedPrn),
    acceptPrn: runPrnCommand(decideAcceptPrn),
    rejectPrn: runPrnCommand(decideRejectPrn),

    /**
     * The PRN's stream events after a watermark: the catch-up tail a read
     * projection folds onto a fetched PRN to bring it current.
     *
     * @param {{ registrationId: string, accreditationId: string, prnId: string, afterEventNumber: number }} params
     * @returns {Promise<import('../repository/stream-port.js').StreamEvent[]>}
     */
    prnCatchupEvents: async ({
      registrationId,
      accreditationId,
      prnId,
      afterEventNumber
    }) =>
      streamRepository.findEventsByPrnIdAfter(
        registrationId,
        validateAccreditationId(accreditationId),
        prnId,
        afterEventNumber
      )
  }
}
