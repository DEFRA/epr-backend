/** @import { OperatorCounts } from '#market-insights/application/operator-counts.js' */

/** The Analysis Function's shorthand for a confidential figure. */
export const CONFIDENTIAL = '[c]'

/**
 * Whether a row's figures are confidential, by the rule the regulator pages
 * mark them by.
 *
 * @param {Pick<OperatorCounts, 'operatorCount'>} counts
 * @param {boolean} rowHoldsData
 * @returns {boolean}
 */
export const isConfidential = ({ operatorCount }, rowHoldsData) =>
  operatorCount === 1 ||
  operatorCount === 2 ||
  (operatorCount === 0 && rowHoldsData)
