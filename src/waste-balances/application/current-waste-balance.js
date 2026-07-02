import { STREAM_EVENT_KIND } from '../repository/stream-schema.js'

/**
 * The current waste balance for a registration or accreditation, read from its
 * ledger. The ledger is the sole record of the balance: the latest event's
 * closing balance is the resolved amount, its `number` is the head, and the
 * latest `summary-log-submitted` event supplies the running credit total. A
 * registration or accreditation with no events yet has no balance, so this
 * resolves to `null`.
 *
 * The `organisationId` on the result is the caller's own — carried through from
 * the ledger id it asked for, not recovered from the latest event.
 *
 * @param {import('../repository/stream-port.js').WasteBalanceStreamRepository} streamRepository
 * @param {import('../repository/stream-schema.js').WasteBalanceLedgerId} ledgerId - The
 *   registration or accreditation whose ledger is read.
 * @returns {Promise<import('../domain/model.js').WasteBalance | null>}
 */
export const currentWasteBalance = async (
  streamRepository,
  { organisationId, registrationId, accreditationId }
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
    organisationId,
    registrationId,
    accreditationId,
    amount: latest.closingBalance.amount,
    availableAmount: latest.closingBalance.availableAmount,
    eventNumber: latest.number,
    creditTotal
  }
}
