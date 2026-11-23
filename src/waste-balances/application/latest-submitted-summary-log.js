/** @import {SummaryLogFileId} from '#domain/summary-logs/ids.js' */
import { LEDGER_EVENT_KIND } from '../repository/ledger-schema.js'

/**
 * The latest submitted summary log for a ledger — its `summaryLogId` together
 * with when it was submitted and the number of its `SUMMARY_LOG_SUBMITTED`
 * event.
 * Returns `null` when the ledger has no summary-log submission yet.
 *
 * @param {import('../repository/ledger-port.js').WasteBalanceLedgerRepository} ledgerRepository
 * @param {import('../repository/ledger-schema.js').WasteBalanceLedgerId} ledgerId
 * @returns {Promise<{ summaryLogId: SummaryLogFileId, submittedAt: Date, number: number } | null>}
 */
export const latestSubmittedSummaryLog = async (ledgerRepository, ledgerId) => {
  const latest = await ledgerRepository.findLatestInLedgerByKind(
    ledgerId,
    LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
  )

  if (latest === null) {
    return null
  }

  const { summaryLogId } =
    /** @type {import('../repository/ledger-schema.js').SummaryLogSubmittedPayload} */ (
      latest.payload
    )

  return { summaryLogId, submittedAt: latest.createdAt, number: latest.number }
}
