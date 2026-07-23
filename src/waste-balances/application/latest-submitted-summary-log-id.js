import { latestSubmittedSummaryLog } from './latest-submitted-summary-log.js'

/**
 * Resolve the `summaryLogId` of the most recent submitted summary log for a
 * ledger — the head the summary-log-row-state reads pivot on. Returns
 * `null` when the ledger has no summary-log submission yet.
 *
 * @param {import('../repository/ledger-port.js').WasteBalanceLedgerRepository} ledgerRepository
 * @param {import('../repository/ledger-schema.js').WasteBalanceLedgerId} ledgerId
 * @returns {Promise<string | null>}
 */
export const latestSubmittedSummaryLogId = async (
  ledgerRepository,
  ledgerId
) => {
  const latest = await latestSubmittedSummaryLog(ledgerRepository, ledgerId)

  return latest === null ? null : latest.summaryLogId
}
