/** @import { OperatorCounts } from '#market-insights/application/operator-counts.js' */

/**
 * The Analysis Function's shorthand for a figure that would give away
 * confidential information about a single respondent.
 */
export const CONFIDENTIAL = '[c]'

/**
 * Whether fewer than three operators were accredited for a row that holds
 * data, the rule the regulator pages mark figures by. Three is where nobody
 * can tell which of them reported. A row with one or two identifies them
 * however few of them reported, so it holds even where the row is all zeros;
 * a row with none identifies whichever one still put something into it, for
 * example a late report from an operator cancelled for the whole month. A row
 * with none accredited and nothing in it identifies no one.
 *
 * @param {Pick<OperatorCounts, 'operatorCount'>} counts
 * @param {boolean} rowHoldsData
 * @returns {boolean}
 */
export const fromFewOperators = ({ operatorCount }, rowHoldsData) =>
  operatorCount === 1 ||
  operatorCount === 2 ||
  (operatorCount === 0 && rowHoldsData)
