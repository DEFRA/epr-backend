import { createHash } from 'node:crypto'
import { stringify } from 'safe-stable-stringify'

/** @import { SummaryLogContext } from './classification-context.js' */

/**
 * Registered-only logs carry `ORS_VALIDATION_DISABLED` as their overseas
 * sites, and a symbol would otherwise drop out of the JSON.
 *
 * @param {string} _key
 * @param {unknown} value
 */
const symbolAsString = (_key, value) =>
  typeof value === 'symbol' ? value.toString() : value

/**
 * The context a summary log's rows were read against, as a hash. The table
 * schemas are left out: they follow from the summary log's year and template,
 * which do not change.
 *
 * @param {Omit<SummaryLogContext, 'tableSchemas'> & Partial<Pick<SummaryLogContext, 'tableSchemas'>>} classificationContext
 * @returns {string}
 */
export const hashClassificationContext = ({
  tableSchemas: _followsFromTheTemplate,
  ...context
}) =>
  createHash('sha256')
    .update(/** @type {string} */ (stringify(context, symbolAsString)))
    .digest('hex')
