/**
 * @typedef {import('#market-insights/application/monthly-reports.js').OwedReport} OwedReport
 */

/**
 * An operator's registration that could put data into a month's figures.
 *
 * @typedef {Pick<OwedReport, 'month' | 'org' | 'registration'>} Contribution
 */

/**
 * How many separate operators could have contributed to a figure, and how many
 * of them it includes data from.
 *
 * @typedef {{ operatorCount: number, submittingOperatorCount: number }} OperatorCounts
 */

/**
 * The operators behind every figure, each keyed as the figure is.
 *
 * @typedef {Object} OperatorsByFigure
 * @property {Map<string, Set<string>>} possible - those who could have contributed
 * @property {Map<string, Set<string>>} submitting - those whose data the figure includes
 */

/**
 * The separate operators among the contributions, under every key each
 * contribution belongs to. An operator counts once however many sites it
 * reports from.
 *
 * @param {Iterable<Contribution>} contributions
 * @param {(contribution: Contribution) => string[]} keysOf
 * @returns {Map<string, Set<string>>}
 */
const operatorsByKey = (contributions, keysOf) => {
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
 * The operators behind every figure. Whoever owed the month a report could
 * have contributed to it, and so could whoever the figure includes data from,
 * owed or not.
 *
 * @param {Iterable<Contribution>} owed - the monthly reports owed
 * @param {Contribution[]} included - what the figures include
 * @param {(contribution: Contribution) => string[]} keysOf - the figures each contribution belongs to
 * @returns {OperatorsByFigure}
 */
export const operatorsByFigure = (owed, included, keysOf) => ({
  possible: operatorsByKey([...owed, ...included], keysOf),
  submitting: operatorsByKey(included, keysOf)
})

/**
 * @param {OperatorsByFigure} operators
 * @param {string} key
 * @returns {OperatorCounts}
 */
export const operatorCountsOf = ({ possible, submitting }, key) => ({
  operatorCount: possible.get(key)?.size ?? 0,
  submittingOperatorCount: submitting.get(key)?.size ?? 0
})
