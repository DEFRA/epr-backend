import { add, toNumber } from '#common/helpers/decimal-utils.js'
import {
  decemberKeyForYearOf,
  monthKeyForDate
} from '#common/helpers/dates/year-month.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { contributionFor } from '#waste-balances/domain/credited-tonnage.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'

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
 * Whether a row is December-dated and of a December-accruing record type.
 * Reprocessor-output is excluded outright: its balance-affecting date is
 * load-left-site, not received-for-recycling (ADR-0049), the wrong trigger
 * for December under the 2024 Regulations.
 *
 * @param {import('./target-amount.js').ClassifiedRow} row
 * @param {string} decemberKey - the `YYYY-12` key of the accreditation-year December
 * @returns {boolean}
 */
const isDecemberRow = (row, decemberKey) => {
  const processingType = row.data.processingType
  if (processingType === PROCESSING_TYPES.REPROCESSOR_OUTPUT) {
    return false
  }

  const contribution = contributionFor(row, processingType)
  if (contribution === null) {
    return false
  }
  if (!DECEMBER_ACCRUING_RECORD_TYPES.has(row.wasteRecordType)) {
    return false
  }

  return monthKeyForDate(row.data[contribution.dateField]) === decemberKey
}

/**
 * A row's target amount when it's a December row, zero otherwise.
 *
 * @param {import('./target-amount.js').ClassifiedRow} row
 * @param {string} decemberKey - the `YYYY-12` key of the accreditation-year December
 * @returns {number}
 */
const decemberAmountForRow = (row, decemberKey) =>
  isDecemberRow(row, decemberKey) ? getTargetAmount(row.classification) : 0

/**
 * The tonnage that accrues to the December portion of a summary-log
 * submission: the sum of each classified row's `decemberAmountForRow`.
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

/**
 * How many of the given classified rows are December rows eligible for the
 * waste balance. Counted per row rather than summed, so amounts that would
 * cancel in `decemberCreditTotalFor` still count here.
 *
 * @param {import('./target-amount.js').ClassifiedRow[]} classifiedRows
 * @param {{ validFrom?: string } | null} accreditation - only the
 *   accreditation-year `validFrom` is read; a full `Accreditation` is
 *   assignable.
 * @returns {number}
 */
export const decemberRowCountFor = (classifiedRows, accreditation) => {
  if (accreditation === null) {
    return 0
  }

  const decemberKey = decemberKeyForYearOf(accreditation.validFrom)
  if (decemberKey === null) {
    return 0
  }

  return classifiedRows.filter(
    (row) =>
      isDecemberRow(row, decemberKey) &&
      row.classification.outcome === WASTE_BALANCE_OUTCOME.INCLUDED
  ).length
}
