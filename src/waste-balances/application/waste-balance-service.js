import Boom from '@hapi/boom'

import { submitSummaryLog as decideSummaryLog } from '../domain/commands.js'
import { currentWasteBalance } from './current-waste-balance.js'
import { performUpdateViaLedger } from './update-via-ledger.js'
import { validateAccreditationId } from '../repository/validation.js'

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
 * A PRN command in flight: the ledger balance its decision is made against —
 * `null` for a ledger with no events — and the commit that appends that
 * decision at the head the balance was folded from.
 *
 * `append` commits once: the command is bound to the stream tip its fold
 * observed, and the attempt consumes it whether or not it succeeded. A second
 * call would append from a now-stale view of that tip, and ADR-0036 asks for a
 * fresh computation against current state rather than a silent retry, so it is
 * refused rather than absorbed.
 *
 * @typedef {Object} PrnCommand
 * @property {import('../repository/ledger-schema.js').LedgerBalanceSnapshot | null} balance
 * @property {(events: import('../domain/commands.js').BalanceEvent[]) => Promise<import('../repository/ledger-port.js').LedgerEvent[]>} append
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
   * Begin a PRN command: assert the positive-amount invariant the deciders
   * trust, fold the ledger, and hand back the balance to decide against
   * together with the append that commits the decision.
   *
   * Everything the decision reads must be read after this call, so nothing it
   * rules on is older than the head those events land on. The slot index alone
   * only settles writers contending for the same slot; a writer that folds
   * after a competitor's append sees the moved head, takes the next free slot,
   * and commits a second time with every guard satisfied (PAE-1844). Both
   * halves assume the decision's reads go to the same node as the fold, which
   * the driver's default primary read preference gives us.
   *
   * `balance` is `null` for a ledger with no events, handed back like any other
   * state: whether that is a client error or corruption depends on the
   * transition, which the ledger does not know.
   *
   * A non-positive amount is a broken invariant rather than a client error —
   * tonnage is validated positive at the route and in the PRN schema — so it
   * surfaces as a 500 rather than slipping past the deciders' `<` check.
   *
   * @param {import('../repository/ledger-schema.js').WasteBalanceLedgerId} ledgerId
   * @param {import('../repository/ledger-schema.js').PrnPayload} payload
   * @param {import('../repository/ledger-schema.js').LedgerUserSummary} createdBy
   * @returns {Promise<PrnCommand>}
   */
  const beginPrnCommand = async (ledgerId, payload, createdBy) => {
    if (!(payload.amount > 0)) {
      throw Boom.badImplementation(
        `PRN amount must be positive at the waste-balance write boundary; received ${payload.amount}`
      )
    }

    const { state, head } = await fold(ledgerId)
    let appendAttempted = false

    return {
      balance: state ? state.balance : null,
      append: async (events) => {
        if (appendAttempted) {
          throw Boom.badImplementation(
            'A PRN command commits once; a second append would write from a now-stale view of the stream tip'
          )
        }
        appendAttempted = true
        return append(ledgerId, head, events, createdBy)
      }
    }
  }

  return { fold, append, beginPrnCommand }
}

/**
 * The single application boundary over the waste balance ledger. Each command
 * folds the ledger once, runs the pure command core against that state, and
 * appends the returned event(s) at the next slot over the event store. The slot
 * index is the optimistic-concurrency guard: a head that moved after the fold
 * leaves the next slot occupied, so the append rejects with a
 * `LedgerSlotConflictError` and the conflict surfaces to the caller — no
 * in-process retry (ADR-0036). Where each command makes its decision settles
 * the rest, as `beginPrnCommand` describes.
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
  const { fold, append, beginPrnCommand } =
    createLedgerCommands(ledgerRepository)

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

    beginPrnCommand,

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
