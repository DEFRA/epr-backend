import { submitSummaryLog as decideSummaryLog } from '../domain/commands.js'
import { currentWasteBalance } from './current-waste-balance.js'

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
    }
  }
}
