import Boom from '@hapi/boom'

import {
  submitSummaryLog as decideSummaryLog,
  PRN_COMMAND_STATUS
} from '../domain/commands.js'
import { currentWasteBalance } from './current-waste-balance.js'
import { performUpdateViaLedger } from './update-via-ledger.js'
import { validateAccreditationId } from '../repository/validation.js'

/**
 * The outcome of a PRN command: the appended ledger events when it commits, or
 * the reason it did not. The application layer turns a rejection into the
 * contextual error its callers expect.
 *
 * @typedef {{ status: 'committed', events: import('../repository/ledger-port.js').LedgerEvent[] }
 *   | { status: 'rejected', reason: import('../domain/commands.js').PrnCommandRejection }} PrnCommandResult
 */

/**
 * Commits a summary-log-submitted event to a ledger, returning the appended
 * event(s).
 *
 * @typedef {(
 *   ledgerId: import('../repository/ledger-schema.js').WasteBalanceLedgerId,
 *   submission: import('../repository/ledger-schema.js').SummaryLogSubmittedPayload,
 *   createdBy: import('../repository/ledger-schema.js').LedgerUserSummary,
 *   createdAt?: Date
 * ) => Promise<import('../repository/ledger-port.js').LedgerEvent[]>} CommitSummaryLogSubmittedEvent
 */

/**
 * The ledger command machinery, sharing one captured ledger repository: fold
 * the ledger into decidable state, append decided events, and run a PRN command
 * end to end. The service surface is assembled from these.
 *
 * @param {import('../repository/ledger-port.js').WasteBalanceLedgerRepository} ledgerRepository
 */
const createLedgerCommands = (ledgerRepository) => {
  /**
   * Fold the ledger into the state a command decides against, plus the head the
   * decision is made at.
   *
   * @param {import('../repository/ledger-schema.js').WasteBalanceLedgerId} ledgerId
   * @returns {Promise<{ state: import('../domain/commands.js').LedgerState | null, head: number }>}
   */
  const fold = async (ledgerId) => {
    const balance = await currentWasteBalance(ledgerRepository, ledgerId)
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
   * each with the ledger identity, its slot, and provenance. `createdAt`
   * defaults to now for a live command; the historical backfill supplies the
   * original submission time so replayed history is dated when it happened.
   *
   * @param {import('../repository/ledger-schema.js').WasteBalanceLedgerId} ledgerId
   * @param {number} head
   * @param {import('../domain/commands.js').BalanceEvent[]} events
   * @param {import('../repository/ledger-schema.js').LedgerUserSummary} createdBy
   * @param {Date} [createdAt]
   * @returns {Promise<import('../repository/ledger-port.js').LedgerEvent[]>}
   */
  const append = (
    ledgerId,
    head,
    events,
    createdBy,
    createdAt = new Date()
  ) => {
    return ledgerRepository.appendEvents(
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
   * Run a PRN command: assert the positive-amount invariant the deciders trust,
   * fold the ledger, let the caller decide against the folded balance, and
   * append what it returns.
   *
   * The fold yields `null` for a ledger with no events, and that is handed to
   * the decision like any other state rather than short-circuited here. Whether
   * a missing ledger is a client error or corruption depends on the transition
   * being made, which is the caller's business, not the ledger's — and the
   * caller must get to rule on that transition before anything else answers for
   * it.
   *
   * `decide` is the caller's business rule, not a condition bolted onto one: it
   * either yields the events to append or the reason there are none. It runs
   * after the fold, so anything it reads for itself — the PRN's own status, say
   * — is no older than the head those events land on. That ordering is what
   * makes the pair of guards complete. The slot index alone only settles
   * writers contending for the same slot: a writer that folds after a
   * competitor's append sees the moved head and takes the next free slot, so
   * every guard is satisfied and the command commits twice over.
   *
   * A non-positive amount is a broken invariant, not a client error: the PRN's
   * tonnage is validated positive at the HTTP route and the PRN repository
   * schema, so anything reaching this boundary is internal corruption and
   * surfaces as a 500 the platform logs and alerts on, rather than slipping past
   * the deciders' `<` sufficiency check to inflate the balance.
   *
   * @param {import('../repository/ledger-schema.js').WasteBalanceLedgerId} ledgerId
   * @param {import('../repository/ledger-schema.js').PrnPayload} payload
   * @param {import('../repository/ledger-schema.js').LedgerUserSummary} createdBy
   * @param {(balance: import('../repository/ledger-schema.js').LedgerBalanceSnapshot | null) => Promise<import('../domain/commands.js').PrnDecision>} decide
   * @returns {Promise<PrnCommandResult>}
   */
  const runPrnCommand = async (ledgerId, payload, createdBy, decide) => {
    if (!(payload.amount > 0)) {
      throw Boom.badImplementation(
        `PRN amount must be positive at the waste-balance write boundary; received ${payload.amount}`
      )
    }

    const { state, head } = await fold(ledgerId)

    const decision = await decide(state ? state.balance : null)
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
 * `LedgerSlotConflictError` and the conflict surfaces to the caller — no
 * in-process retry (ADR-0036).
 *
 * The slot index settles only writers contending for the same slot, so every
 * decision a command makes must come from a read taken at or after its fold.
 * Anything the fold does not carry is read by the caller's decider, inside
 * `runPrnCommand`.
 *
 * @param {import('../repository/ledger-port.js').WasteBalanceLedgerRepository} ledgerRepository
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [systemLogsRepository]
 *   Sink for the balance-update audit trail. Omitted outside the summary-log
 *   write path, where the audit is not emitted.
 */
export const createWasteBalanceService = (
  ledgerRepository,
  systemLogsRepository
) => {
  const { fold, append, runPrnCommand } = createLedgerCommands(ledgerRepository)

  /**
   * Commit a summary-log-submitted event to the ledger.
   *
   * @type {CommitSummaryLogSubmittedEvent}
   */
  const commitSummaryLogSubmittedEvent = async (
    ledgerId,
    submission,
    createdBy,
    createdAt
  ) => {
    const { state, head } = await fold(ledgerId)
    return append(
      ledgerId,
      head,
      decideSummaryLog(state, submission),
      createdBy,
      createdAt
    )
  }

  return {
    /**
     * The current balance folded from the ledger, or `null` when the ledger
     * has no events yet. This is the read side of the same fold the commands
     * decide against.
     *
     * @param {import('../repository/ledger-schema.js').WasteBalanceLedgerId} ledgerId
     * @returns {Promise<import('../domain/model.js').WasteBalance | null>}
     */
    currentBalance: (ledgerId) =>
      currentWasteBalance(ledgerRepository, ledgerId),

    commitSummaryLogSubmittedEvent,

    /**
     * Credit the ledger from a summary log's waste records: mark each row's
     * balance inclusion, then fold, decide, and append the aggregate
     * submission. The sole write entry the summary-log worker calls.
     *
     * @param {import('#domain/waste-records/model.js').WasteRecord[]} wasteRecords
     * @param {Object} options
     * @param {import('#domain/summary-logs/worker/port.js').SubmitUser} options.user
     * @param {import('#domain/organisations/accreditation.js').Accreditation} options.accreditation
     * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} options.overseasSites
     * @param {string} options.summaryLogId
     * @returns {Promise<void>}
     */
    submitSummaryLog: async (
      wasteRecords,
      { user, accreditation, overseasSites, summaryLogId }
    ) => {
      if (wasteRecords.length === 0) {
        return
      }

      await performUpdateViaLedger({
        wasteRecords,
        accreditation: {
          ...accreditation,
          id: validateAccreditationId(accreditation.id)
        },
        commitSummaryLogSubmittedEvent,
        dependencies: { systemLogsRepository },
        user,
        overseasSites,
        summaryLogId
      })
    },

    runPrnCommand,

    /**
     * The PRN's ledger events after a watermark: the catch-up tail a read
     * projection folds onto a fetched PRN to bring it current. This is a ledger
     * read that happens to be about a PRN, so it names its ledger in full and
     * the `prnId` selects within it.
     *
     * @param {{ organisationId: string, registrationId: string, accreditationId: string, prnId: string, afterEventNumber: number }} params
     * @returns {Promise<import('../repository/ledger-port.js').LedgerEvent[]>}
     */
    prnCatchupEvents: async ({
      organisationId,
      registrationId,
      accreditationId,
      prnId,
      afterEventNumber
    }) =>
      ledgerRepository.findEventsByPrnIdAfter(
        {
          organisationId,
          registrationId,
          accreditationId: validateAccreditationId(accreditationId)
        },
        prnId,
        afterEventNumber
      )
  }
}
