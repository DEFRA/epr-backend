/**
 * @typedef {import('#market-insights/application/monthly-reports.js').OwedReport} OwedReport
 */

/**
 * An operator's registration that could put data into a month's figures.
 *
 * @typedef {Pick<OwedReport, 'month' | 'org' | 'registration'>} Contribution
 */

/**
 * How many separate operators were accredited for a figure's material in its
 * month, and how many of them it includes data from.
 *
 * @typedef {{ operatorCount: number, submittingOperatorCount: number }} OperatorCounts
 */

/**
 * The operators behind every figure, each keyed as the figure is.
 *
 * @typedef {Object} OperatorsByFigure
 * @property {Map<string, Set<string>>} accredited - those accredited for it on some day of its month
 * @property {Map<string, Set<string>>} submitting - those whose data the figure includes
 */

/**
 * The separate operators among the contributions, under every key each
 * contribution belongs to. An operator counts once however many sites it
 * reports from.
 *
 * @template {Contribution} C
 * @param {Iterable<C>} contributions
 * @param {(contribution: C) => string[]} keysOf
 * @returns {Map<string, Set<string>>}
 */
export const operatorsByKey = (contributions, keysOf) => {
  /** @type {Map<string, Set<string>>} */
  const operators = new Map()
  for (const contribution of contributions) {
    for (const key of keysOf(contribution)) {
      operators.set(
        key,
        (operators.get(key) ?? new Set()).add(contribution.org.id)
      )
    }
  }
  return operators
}

/**
 * The operators behind every figure. An operator was accredited for a month
 * exactly when it owed that month a report, whatever data the figure includes.
 *
 * @param {Iterable<Contribution>} owed - the monthly reports owed
 * @param {Contribution[]} included - what the figures include
 * @param {(contribution: Contribution) => string[]} keysOf - the figures each contribution belongs to
 * @returns {OperatorsByFigure}
 */
export const operatorsByFigure = (owed, included, keysOf) => ({
  accredited: operatorsByKey(owed, keysOf),
  submitting: operatorsByKey(included, keysOf)
})

/**
 * @param {OperatorsByFigure} operators
 * @param {string} key
 * @returns {OperatorCounts}
 */
export const operatorCountsOf = ({ accredited, submitting }, key) => ({
  operatorCount: accredited.get(key)?.size ?? 0,
  submittingOperatorCount: submitting.get(key)?.size ?? 0
})
