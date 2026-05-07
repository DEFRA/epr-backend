import { WASTE_BALANCE_CANONICAL_SOURCE } from '../domain/model.js'

/**
 * Marker-aware substitution of `amount` / `availableAmount` on a waste-balance
 * document. When `canonicalSource` is `'ledger'` the embedded amounts are stale
 * and the latest ledger transaction's `closingBalance` is the source of truth;
 * `'embedded'` and `'migrating'` markers leave the document unchanged because
 * the embedded write path is still authoritative for them.
 *
 * Marker `'ledger'` with an empty ledger should not occur in practice — the
 * sweep populates the ledger before flipping the marker — but is treated as a
 * zero balance to keep the read path safe.
 *
 * `ledgerRepository` is optional so tests that exercise embedded/migrating
 * paths can wire the waste-balances repository without a ledger; an undefined
 * ledger combined with marker `'ledger'` is a wiring bug and trips an explicit
 * error rather than silently returning stale embedded amounts.
 *
 * @param {import('../domain/model.js').WasteBalance} balance
 * @param {import('./ledger-port.js').LedgerRepository | undefined} ledgerRepository
 * @returns {Promise<import('../domain/model.js').WasteBalance>}
 */
export const resolveBalanceAmounts = async (balance, ledgerRepository) => {
  if (balance.canonicalSource !== WASTE_BALANCE_CANONICAL_SOURCE.LEDGER) {
    return balance
  }

  if (!ledgerRepository) {
    throw new Error(
      `Cannot resolve marker 'ledger' without a ledger repository (accreditationId=${balance.accreditationId})`
    )
  }

  const latest = await ledgerRepository.findLatestByAccreditationId(
    balance.accreditationId
  )

  if (!latest) {
    return { ...balance, amount: 0, availableAmount: 0 }
  }

  return {
    ...balance,
    amount: latest.closingBalance.amount,
    availableAmount: latest.closingBalance.availableAmount
  }
}
