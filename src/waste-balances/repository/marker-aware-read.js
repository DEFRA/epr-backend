import { WASTE_BALANCE_CANONICAL_SOURCE } from '../domain/model.js'

/**
 * Marker-aware substitution of `amount` / `availableAmount` on a waste-balance
 * document. When `canonicalSource` is `'ledger'` the embedded amounts are stale
 * and the latest stream event's `closingBalance` is the source of truth;
 * `'embedded'` and `'migrating'` markers leave the document unchanged because
 * the embedded write path is still authoritative for them.
 *
 * An empty stream under a `'ledger'` marker means the accreditation was
 * promoted with zero activity. This is legitimate for accreditations that
 * never received waste records, so the function returns zero balances
 * instead of throwing.
 *
 * @param {import('../domain/model.js').WasteBalance} balance
 * @param {import('./stream-port.js').WasteBalanceStreamRepository} streamRepository
 * @returns {Promise<import('../domain/model.js').WasteBalance>}
 */
export const resolveBalanceAmounts = async (balance, streamRepository) => {
  if (balance.canonicalSource !== WASTE_BALANCE_CANONICAL_SOURCE.LEDGER) {
    return balance
  }

  const latest = await streamRepository.findLatestByPartition(
    /** @type {string} */ (balance.registrationId),
    balance.accreditationId
  )

  if (!latest) {
    return {
      ...balance,
      amount: 0,
      availableAmount: 0
    }
  }

  return {
    ...balance,
    amount: latest.closingBalance.amount,
    availableAmount: latest.closingBalance.availableAmount
  }
}
