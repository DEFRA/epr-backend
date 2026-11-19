import { createHash } from 'node:crypto'
import { stringify } from 'safe-stable-stringify'

/** @import { ClassificationContext } from '#domain/summary-logs/table-schemas/validation-pipeline.js' */

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
 * The accreditation and overseas sites a summary log's rows were classified
 * against, as a hash. The table schemas are left out: they follow from the
 * summary log's year and template, which do not change.
 *
 * @param {ClassificationContext} classificationContext
 * @returns {string}
 */
export const hashClassificationContext = ({ accreditation, overseasSites }) =>
  createHash('sha256')
    .update(
      /** @type {string} */ (
        stringify({ accreditation, overseasSites }, symbolAsString)
      )
    )
    .digest('hex')
