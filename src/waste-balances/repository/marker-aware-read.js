import Boom from '@hapi/boom'

import { WASTE_BALANCE_CANONICAL_SOURCE } from '../domain/model.js'

/**
 * Marker-aware substitution of `amount` / `availableAmount` on a waste-balance
 * document. When `canonicalSource` is `'ledger'` the embedded amounts are stale
 * and the latest ledger transaction's `closingBalance` is the source of truth;
 * `'embedded'` and `'migrating'` markers leave the document unchanged because
 * the embedded write path is still authoritative for them.
 *
 * Marker `'ledger'` with an empty ledger is an invariant violation — the sweep
 * must populate the ledger before flipping the marker. Throws so the
 * inconsistency surfaces instead of being masked as a zero balance.
 *
 * @param {import('../domain/model.js').WasteBalance} balance
 * @param {import('./ledger-port.js').LedgerRepository} ledgerRepository
 * @returns {Promise<import('../domain/model.js').WasteBalance>}
 */
export const resolveBalanceAmounts = async (balance, ledgerRepository) => {
  if (balance.canonicalSource !== WASTE_BALANCE_CANONICAL_SOURCE.LEDGER) {
    return balance
  }

  const latest = await ledgerRepository.findLatestByAccreditationId(
    balance.accreditationId
  )

  if (!latest) {
    throw Boom.internal(
      `Waste balance ${balance.accreditationId} has canonicalSource 'ledger' but no ledger transactions`
    )
  }

  return {
    ...balance,
    amount: latest.closingBalance.amount,
    availableAmount: latest.closingBalance.availableAmount
  }
}
