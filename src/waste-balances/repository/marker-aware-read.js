import Boom from '@hapi/boom'

import { WASTE_BALANCE_CANONICAL_SOURCE } from '../domain/model.js'

/**
 * Marker-aware substitution of `amount` / `availableAmount` on a waste-balance
 * document. When `canonicalSource` is `'ledger'` the embedded amounts are stale
 * and the latest stream event's `closingBalance` is the source of truth;
 * `'embedded'` and `'migrating'` markers leave the document unchanged because
 * the embedded write path is still authoritative for them.
 *
 * Marker `'ledger'` with no stream events is an invariant violation: the
 * promotion sweep must populate the stream before flipping the marker. Throws
 * so the inconsistency surfaces instead of being masked as a zero balance.
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
    throw Boom.internal(
      `Waste balance ${balance.accreditationId} has canonicalSource 'ledger' but no stream events`
    )
  }

  return {
    ...balance,
    amount: latest.closingBalance.amount,
    availableAmount: latest.closingBalance.availableAmount
  }
}
