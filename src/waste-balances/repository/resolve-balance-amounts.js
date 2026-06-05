import { ZERO_BALANCE } from './stream-schema.js'

/**
 * Resolve a waste-balance document's `amount` / `availableAmount` from the
 * event-sourced stream. The document's own amount fields are derived state;
 * the latest stream event's `closingBalance` is the source of truth.
 *
 * An empty stream means the accreditation was created with zero activity —
 * legitimate for accreditations that never received waste records — so the
 * function returns zero balances instead of throwing.
 *
 * @param {import('../domain/model.js').WasteBalance} balance
 * @param {import('./stream-port.js').WasteBalanceStreamRepository} streamRepository
 * @returns {Promise<import('../domain/model.js').WasteBalance>}
 */
export const resolveBalanceAmounts = async (balance, streamRepository) => {
  const latest = await streamRepository.findLatestByPartition(
    /** @type {string} */ (balance.registrationId),
    balance.accreditationId
  )

  if (!latest) {
    return {
      ...balance,
      ...ZERO_BALANCE
    }
  }

  return {
    ...balance,
    amount: latest.closingBalance.amount,
    availableAmount: latest.closingBalance.availableAmount
  }
}
