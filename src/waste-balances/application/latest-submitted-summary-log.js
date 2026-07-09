import { LEDGER_EVENT_KIND } from '../repository/ledger-schema.js'

/**
 * The latest submitted summary log for a ledger — its `summaryLogId` together
 * with when it was submitted (the `SUMMARY_LOG_SUBMITTED` event's timestamp).
 * Returns `null` when the ledger has no summary-log submission yet.
 *
 * @param {import('../repository/ledger-port.js').WasteBalanceLedgerRepository} ledgerRepository
 * @param {{ registrationId: string, accreditationId: string | null }} ledgerId
 * @returns {Promise<{ summaryLogId: string, submittedAt: Date } | null>}
 */
export const latestSubmittedSummaryLog = async (
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

  const { summaryLogId } =
    /** @type {import('../repository/ledger-schema.js').SummaryLogSubmittedPayload} */ (
      latest.payload
    )

  return { summaryLogId, submittedAt: latest.createdAt }
}
