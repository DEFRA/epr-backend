import { createHash } from 'node:crypto'

/** @import { ClassificationContext } from '#domain/summary-logs/table-schemas/validation-pipeline.js' */

/**
 * @param {unknown} value
 * @returns {unknown}
 */
const canonicalise = (value) => {
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'symbol') {
    return value.toString()
  }
  if (Array.isArray(value)) {
    return value.map(canonicalise)
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort((a, b) => a.localeCompare(b))
        .map((key) => [
          key,
          canonicalise(/** @type {Record<string, unknown>} */ (value)[key])
        ])
    )
  }
  return value
}

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
    .update(JSON.stringify(canonicalise({ accreditation, overseasSites })))
    .digest('hex')
