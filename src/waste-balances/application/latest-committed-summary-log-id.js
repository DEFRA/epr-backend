import { STREAM_EVENT_KIND } from '../repository/stream-schema.js'

/**
 * Resolve the `summaryLogId` of the most recent committed submission for a
 * stream partition — the committed head the waste-record-state reads pivot on. Returns
 * `null` when the partition has no summary-log submission yet.
 *
 * @param {import('../repository/stream-port.js').WasteBalanceStreamRepository} streamRepository
 * @param {{ registrationId: string, accreditationId: string | null }} partition
 * @returns {Promise<string | null>}
 */
export const latestCommittedSummaryLogId = async (
  streamRepository,
  { registrationId, accreditationId }
) => {
  const latest = await streamRepository.findLatestByPartitionAndKind(
    registrationId,
    accreditationId,
    STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED
  )

  if (latest === null) {
    return null
  }

  return /** @type {import('../repository/stream-schema.js').SummaryLogSubmittedPayload} */ (
    latest.payload
  ).summaryLogId
}
