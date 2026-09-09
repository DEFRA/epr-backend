import { add, toNumber } from '#common/helpers/decimal-utils.js'
import {
  decemberKeyForYearOf,
  monthKeyForDate
} from '#common/helpers/dates/year-month.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { contributionFor } from '#waste-balances/domain/credited-tonnage.js'

import { getTargetAmount } from './target-amount.js'

/**
 * The waste-record types that accrue to the December portion. Deliberately its
 * own list, not derived from whether a row credits the general balance: a new
 * record type accrues December only when added here (PAE-1920). Sent-on rows
 * are absent, so a sent-on load deducts from the general balance alone.
 *
 * @type {Set<import('#domain/waste-records/model.js').WasteRecordType>}
 */
const DECEMBER_ACCRUING_RECORD_TYPES = new Set([
  WASTE_RECORD_TYPE.RECEIVED,
  WASTE_RECORD_TYPE.EXPORTED
])

/**
 * The tonnage a single classified row accrues to the December portion: its
 * target amount when it is a December-accruing record type and its balance-
 * affecting date falls in the accreditation-year December, and zero otherwise.
 *
 * The row's granular processing type is read from its own data, exactly as
 * classification reads it (`classifyWasteRecord`), so the December portion is
 * bucketed by the same per-row date-field mapping (`contributionFor`) that the
 * general `creditTotal` uses. Which record types accrue December is a separate
 * decision from which contribute to the general balance
 * (`DECEMBER_ACCRUING_RECORD_TYPES`): reprocessor-output rows, rows whose table
 * does not contribute, and sent-on rows return zero before any date is read. A
 * sent-on load deducts only from the general balance, never from the December
 * portion (PAE-1920).
 *
 * @param {import('./target-amount.js').ClassifiedRow} row
 * @param {string} decemberKey - the `YYYY-12` key of the accreditation-year December
 * @returns {number}
 */
const decemberAmountForRow = (row, decemberKey) => {
  const processingType = row.data.processingType
  if (processingType === PROCESSING_TYPES.REPROCESSOR_OUTPUT) {
    return 0
  }

  const contribution = contributionFor(row, processingType)
  if (contribution === null) {
    return 0
  }
  if (!DECEMBER_ACCRUING_RECORD_TYPES.has(row.wasteRecordType)) {
    return 0
  }
  if (monthKeyForDate(row.data[contribution.dateField]) !== decemberKey) {
    return 0
  }

  return getTargetAmount(row.classification)
}

/**
 * The tonnage that accrues to the December portion of a summary-log
 * submission: the sum, over the classified rows, of each December-accruing
 * row's target amount whose balance-affecting date falls in December of the
 * accreditation year.
 *
 * It narrows the credited-tonnage resolver — the same per-row date-field
 * mapping (`contributionFor`) and signed target amount (`getTargetAmount`) that
 * build the general `creditTotal` — to the accreditation-year December bucket,
 * and then to the December-accruing record types. The December portion stays
 * consistent with the total by construction: excluded rows contribute zero,
 * sent-on rows do not affect the December portion (they deduct only from the
 * general balance), and a resubmission's delta self-corrects.
 *
 * INVARIANT: reprocessor-output never accrues a December portion. Its per-row
 * date is the load-left-site date, not received-for-recycling (ADR-0049), the
 * wrong trigger under the 2024 Regulations, so output rows are excluded outright
 * before any date is read.
 *
 * @param {import('./target-amount.js').ClassifiedRow[]} classifiedRows
 * @param {{ validFrom?: string }} accreditation - only the accreditation-year
 *   `validFrom` is read; a full `Accreditation` is assignable.
 * @returns {number}
 */
export const decemberCreditTotalFor = (classifiedRows, accreditation) => {
  const decemberKey = decemberKeyForYearOf(accreditation.validFrom)
  if (decemberKey === null) {
    return 0
  }

  let total = 0
  for (const row of classifiedRows) {
    total = toNumber(add(total, decemberAmountForRow(row, decemberKey)))
  }

  return total
}
