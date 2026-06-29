/**
 * Read a waste balance for a stream partition. The event-sourced stream is the
 * sole record of the balance: the latest event's closing balance is the
 * resolved amount, and an empty partition means no balance exists for the
 * accreditation.
 *
 * @param {import('./stream-port.js').WasteBalanceStreamRepository} streamRepository
 * @param {{ registrationId: string, accreditationId: string }} partition
 * @returns {Promise<import('../domain/model.js').WasteBalance | null>}
 */
export const findBalanceByPartition = async (
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

  return {
    organisationId: latest.organisationId,
    registrationId,
    accreditationId,
    amount: latest.closingBalance.amount,
    availableAmount: latest.closingBalance.availableAmount,
    eventNumber: latest.number
  }
}
