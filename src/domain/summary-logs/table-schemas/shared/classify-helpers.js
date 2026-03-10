import { isFilled, ROW_OUTCOME } from '../validation-pipeline.js'
import { isWithinAccreditationDateRange } from '#common/helpers/dates/accreditation.js'

export const CLASSIFICATION_REASON = Object.freeze({
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  PRN_ISSUED: 'PRN_ISSUED',
  OUTSIDE_ACCREDITATION_PERIOD: 'OUTSIDE_ACCREDITATION_PERIOD',
  PRODUCT_WEIGHT_NOT_ADDED: 'PRODUCT_WEIGHT_NOT_ADDED'
})

/**
 * Checks whether all required fields are filled in the row data.
 *
 * @param {Record<string, any>} data - The row data
 * @param {string[]} requiredFields - Fields that must be filled
 * @param {Record<string, string[]>} unfilledValues - Per-field unfilled value definitions
 * @returns {{ outcome: 'EXCLUDED', reasons: Array<{ code: string, field: string }> } | null}
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

/**
 * Creates a classifyForWasteBalance function for tables that do not contribute
 * to waste balance but still need date-range checking to preserve IGNORED
 * marking for rows with dates outside the accreditation period.
 *
 * @param {string} dateField - The field name containing the date to check
 * @returns {(data: Record<string, any>, context: { accreditation: object }) => object|null}
 */
export const createDateOnlyClassifier =
  (dateField) =>
  (data, { accreditation }) => {
    const date = data[dateField]

    if (date && !isWithinAccreditationDateRange(date, accreditation)) {
      return {
        outcome: ROW_OUTCOME.IGNORED,
        reasons: [{ code: CLASSIFICATION_REASON.OUTSIDE_ACCREDITATION_PERIOD }]
      }
    }

    return null
  }
