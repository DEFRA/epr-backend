import {
  WASTE_PROCESSING_TYPE,
  REPROCESSING_TYPE
} from '#domain/organisations/model.js'

/**
 * Whether an accreditation accrues a December waste balance (ADR-0049).
 *
 * Exporters and input reprocessors accrue December capacity, so a December
 * declaration on one of their PRNs draws the December pool. Output
 * reprocessors accrue none - their balance credits from processed rows, whose
 * balance-affecting date is the date the load left site, not a December
 * receipt - so they hold a single general balance. This mirrors the row-level
 * exclusion in `december-credit-total.js`, which zeroes `REPROCESSOR_OUTPUT`
 * for the same reason.
 *
 * @param {{ wasteProcessingType: string, reprocessingType?: string }} accreditation
 * @returns {boolean}
 */
export function accruesDecember(accreditation) {
  if (accreditation.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER) {
    return true
  }

  return accreditation.reprocessingType === REPROCESSING_TYPE.INPUT
}

/**
 * Resolve the balance event's `useDecemberBalance` flag from the PRN's
 * self-declared `isDecemberWaste` and whether the accreditation accrues
 * December (ADR-0049). This is the pool-routing decision, distinct from the
 * statutory disclosure marker: an output reprocessor self-declares
 * `isDecemberWaste` for disclosure yet resolves to `false` here, because it
 * accrues no December pool to draw on.
 *
 * @param {Object} params
 * @param {boolean} params.isDecemberWaste
 * @param {{ wasteProcessingType: string, reprocessingType?: string }} params.accreditation
 * @returns {boolean}
 */
export function resolveUseDecemberBalance({ isDecemberWaste, accreditation }) {
  return isDecemberWaste && accruesDecember(accreditation)
}
