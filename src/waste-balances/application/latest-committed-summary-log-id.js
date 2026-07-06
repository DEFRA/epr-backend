import { LEDGER_EVENT_KIND } from '../repository/ledger-schema.js'

/**
 * Resolve the `summaryLogId` of the most recent committed submission for a
 * ledger — the committed head the summary-log-row-state reads pivot on. Returns
 * `null` when the ledger has no summary-log submission yet.
 *
 * @param {import('../repository/ledger-port.js').WasteBalanceLedgerRepository} ledgerRepository
 * @param {{ registrationId: string, accreditationId: string | null }} ledgerId
 * @returns {Promise<string | null>}
 */
export const latestCommittedSummaryLogId = async (
  ledgerRepository,
  { registrationId, accreditationId }
) => {
  const latest = await ledgerRepository.findLatestInLedgerByKind(
    registrationId,
    accreditationId,
    LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
  )

  if (latest === null) {
    return null
  }

  return /** @type {import('../repository/ledger-schema.js').SummaryLogSubmittedPayload} */ (
    latest.payload
  ).summaryLogId
}
