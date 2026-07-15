import { isFilled, ROW_OUTCOME } from '../validation-pipeline.js'
import { CLASSIFICATION_REASON } from './classification-reason.js'

export { CLASSIFICATION_REASON }

/**
 * Checks whether all required fields are filled in the row data.
 *
 * @param {Record<string, any>} data - The row data
 * @param {string[]} requiredFields - Fields that must be filled
 * @param {Record<string, readonly string[]>} unfilledValues - Per-field unfilled value definitions
 * @returns {import('../validation-pipeline.js').WasteBalanceExcludedResult | null}
 *   Returns EXCLUDED result with missing field reasons, or null if all filled
 */
export const checkRequiredFields = (data, requiredFields, unfilledValues) => {
  const missing = requiredFields.filter(
    (field) => !isFilled(data[field], unfilledValues[field] || [])
  )

  if (missing.length > 0) {
    return {
      outcome: ROW_OUTCOME.EXCLUDED,
      reasons: missing.map((field) => ({
        code: CLASSIFICATION_REASON.MISSING_REQUIRED_FIELD,
        field
      }))
    }
  }

  return null
}
