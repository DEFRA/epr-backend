import {
  addRounded,
  roundToTwoDecimalPlaces,
  subtract,
  toNumber
} from '#common/helpers/decimal-utils.js'
import { monthKeyForDate } from '#common/helpers/dates/year-month.js'
import {
  contributionFor,
  processingTypeFor
} from '#waste-balances/domain/credited-tonnage.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'

/**
 * @typedef {import('#waste-balances/domain/credited-tonnage.js').CreditableWasteRecordState} CreditableWasteRecordState
 * @typedef {import('#waste-balances/domain/credited-tonnage.js').AccreditationContext} AccreditationContext
 */

/**
 * The three figures the published Waste Balance tab sums.
 *
 * @typedef {Object} WasteBalanceFigures
 * @property {number} totalCredited - gross tonnage on crediting rows, 2dp
 * @property {number} eligibleForWasteBalance - tonnage that credits the balance, 2dp
 * @property {number} sentOnDeductions - sent-on tonnage, positive, 2dp
 */

/**
 * @typedef {WasteBalanceFigures & { netCredit: number }} PublishedWasteBalanceFigures
 */

/** @type {WasteBalanceFigures} */
export const NO_FIGURES = Object.freeze({
  totalCredited: 0,
  eligibleForWasteBalance: 0,
  sentOnDeductions: 0
})

/**
 * @param {WasteBalanceFigures} a
 * @param {WasteBalanceFigures} b
 * @returns {WasteBalanceFigures}
 */
export const addFigures = (a, b) => ({
  totalCredited: toNumber(addRounded(a.totalCredited, b.totalCredited, 2)),
  eligibleForWasteBalance: toNumber(
    addRounded(a.eligibleForWasteBalance, b.eligibleForWasteBalance, 2)
  ),
  sentOnDeductions: toNumber(
    addRounded(a.sentOnDeductions, b.sentOnDeductions, 2)
  )
})

/**
 * Attach the published net credit: eligible tonnage less sent-on deductions.
 *
 * @param {WasteBalanceFigures} figures
 * @returns {PublishedWasteBalanceFigures}
 */
export const withNetCredit = (figures) => ({
  ...figures,
  netCredit: roundToTwoDecimalPlaces(
    subtract(figures.eligibleForWasteBalance, figures.sentOnDeductions)
  )
})

/**
 * @typedef {Object} MonthlyContribution
 * @property {string | null} month - `YYYY-MM`, or null when the row has no usable date
 * @property {boolean} deducts - whether the row deducts rather than credits
 * @property {WasteBalanceFigures} figures
 */

/**
 * Null when the row's table does not count at all under the accreditation's
 * processing type.
 *
 * @param {CreditableWasteRecordState} rowState
 * @param {AccreditationContext} accreditation
 * @returns {MonthlyContribution | null}
 */
export const monthlyContribution = (rowState, accreditation) => {
  const contribution = contributionFor(
    rowState,
    processingTypeFor(accreditation)
  )
  if (contribution === null) {
    return null
  }

  const month = monthKeyForDate(rowState.data[contribution.dateField])
  const tonnage = roundToTwoDecimalPlaces(contribution.tonnage)

  if (!contribution.credits) {
    return {
      month,
      deducts: true,
      figures: { ...NO_FIGURES, sentOnDeductions: tonnage }
    }
  }

  return {
    month,
    deducts: false,
    figures: {
      ...NO_FIGURES,
      totalCredited: tonnage,
      eligibleForWasteBalance:
        rowState.classification.outcome === WASTE_BALANCE_OUTCOME.INCLUDED
          ? roundToTwoDecimalPlaces(rowState.classification.transactionAmount)
          : 0
    }
  }
}
