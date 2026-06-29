import { STREAM_EVENT_KIND } from '../repository/stream-schema.js'

/**
 * Fold a ledger into the waste-balance aggregate a decision is made against. The
 * event-sourced ledger is the sole record of the balance: the latest event's
 * closing balance is the resolved amount, its `number` is the head, and the
 * latest `summary-log-submitted` event supplies the running credit total. An
 * empty ledger means no balance exists for the registration or accreditation, so
 * the fold resolves to `null`.
 *
 * @param {import('../repository/stream-port.js').WasteBalanceStreamRepository} streamRepository
 * @param {{ registrationId: string, accreditationId: string | null }} ledger - The
 *   registration or accreditation whose ledger is folded.
 * @returns {Promise<import('../domain/model.js').WasteBalance | null>}
 */
export const foldAggregate = async (
  streamRepository,
  { registrationId, accreditationId }
) => {
  const latest = await streamRepository.findLatestByPartition(
    registrationId,
    accreditationId
  )

  if (!latest) {
    return null
  }

  const latestSubmission = await streamRepository.findLatestByPartitionAndKind(
    registrationId,
    accreditationId,
    STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED
  )

  const creditTotal = latestSubmission
    ? /** @type {import('../repository/stream-schema.js').SummaryLogSubmittedPayload} */ (
        latestSubmission.payload
      ).creditTotal
    : 0

  return {
    organisationId: latest.organisationId,
    registrationId,
    accreditationId,
    amount: latest.closingBalance.amount,
    availableAmount: latest.closingBalance.availableAmount,
    eventNumber: latest.number,
    creditTotal
  }
}
