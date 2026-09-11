import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { processingTypeFor } from '#waste-balances/domain/credited-tonnage.js'
import { POOL } from '#waste-balances/repository/ledger-schema.js'

/**
 * The processing types that accrue a December waste balance (ADR-0049): every
 * accredited type except reprocessor-output. Kept as an allowlist so a new
 * accruing type is a one-line addition here. Output reprocessors accrue none:
 * their balance credits from processed rows dated when the load left site, not
 * a December receipt, which is why `december-credit-total.js` excludes
 * `REPROCESSOR_OUTPUT` on the accrual side for the same reason.
 *
 * @type {Set<import('#domain/summary-logs/meta-fields.js').ProcessingType>}
 */
const DECEMBER_ACCRUING_PROCESSING_TYPES = new Set([
  PROCESSING_TYPES.EXPORTER,
  PROCESSING_TYPES.REPROCESSOR_INPUT
])

/**
 * Whether an accreditation accrues a December waste balance, so a December
 * declaration on one of its PRNs draws the December pool rather than the
 * general balance (ADR-0049). The accreditation is mapped to its granular
 * processing type with `processingTypeFor` - the same mapping the credit side
 * uses - and tested against the accruing allowlist. The cast bridges the
 * accreditation's widened `wasteProcessingType: string` to the mapping's
 * narrower type; it is exact at runtime, `processingTypeFor` only compares it.
 *
 * @param {{ wasteProcessingType: string, reprocessingType?: string }} accreditation
 * @returns {boolean}
 */
export const accruesDecember = (accreditation) =>
  DECEMBER_ACCRUING_PROCESSING_TYPES.has(
    processingTypeFor(
      /** @type {import('#waste-balances/domain/credited-tonnage.js').AccreditationContext} */ (
        accreditation
      )
    )
  )

/**
 * Resolve the balance pool a PRN draws on from its self-declared
 * `isDecemberWaste` and whether the accreditation accrues December (ADR-0049).
 * This is the pool-routing decision, distinct from the statutory disclosure
 * marker: an output reprocessor self-declares `isDecemberWaste` for disclosure
 * yet resolves to `general` here, because it accrues no December pool to draw
 * on.
 *
 * @param {Object} params
 * @param {boolean} params.isDecemberWaste
 * @param {{ wasteProcessingType: string, reprocessingType?: string }} params.accreditation
 * @returns {import('#waste-balances/repository/ledger-schema.js').Pool}
 */
export function resolvePool({ isDecemberWaste, accreditation }) {
  return isDecemberWaste && accruesDecember(accreditation)
    ? POOL.DECEMBER
    : POOL.GENERAL
}
