import { logger } from '#common/helpers/logging/logger.js'

import { WASTE_BALANCE_CANONICAL_SOURCE } from '../domain/model.js'
import { ZERO_BALANCE } from './stream-schema.js'

/**
 * Marker-aware substitution of `amount` / `availableAmount` on a waste-balance
 * document. When `canonicalSource` is `'ledger'` the embedded amounts are stale
 * and the latest stream event's `closingBalance` is the source of truth;
 * `'embedded'` and `'migrating'` markers leave the document unchanged because
 * the embedded write path is still authoritative for them.
 *
 * An empty stream under a `'ledger'` marker means the accreditation was
 * promoted before any summary log was submitted, so it has no events yet. This
 * is correct behaviour, and the function returns zero balances rather than
 * throwing. An info-level log makes the zeroing observable in the read path
 * without implying a fault: a populated accreditation resolving to zero would
 * be a problem, but that is caught at promotion time, not here.
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
    logger.info({
      message:
        `Ledger marker resolved against empty stream, returning zero balance:` +
        ` registrationId=${balance.registrationId}` +
        ` accreditationId=${balance.accreditationId}`
    })

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
