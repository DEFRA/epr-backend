/**
 * Validation pipeline for summary log rows
 *
 * Implements the three-outcome classification model:
 * - REJECTED: Fails VAL010 (in-sheet validation of filled fields) → blocks submission
 * - EXCLUDED: Fails VAL011 (missing required fields) → excluded from Waste Balance
 * - INCLUDED: Passes all validation → contributes to Waste Balance
 */

/**
 * Row classification outcomes
 */
export const ROW_OUTCOME = Object.freeze({
  REJECTED: 'REJECTED',
  EXCLUDED: 'EXCLUDED',
  INCLUDED: 'INCLUDED'
})

/**
 * Checks if a value is considered "filled"
 *
 * A value is unfilled if it is:
 * - null
 * - undefined
 * - empty string ''
 * - listed in the unfilledValues array for that field
 *
 * @param {any} value - The value to check
 * @param {string[]} [unfilledValues=[]] - Field-specific values that indicate "unfilled"
 * @returns {boolean} True if the value is filled
 */
export const isFilled = (value, unfilledValues = []) => {
  if (value === null || value === undefined || value === '') {
    return false
  }
  return !unfilledValues.includes(value)
}

/**
 * Filters a row to only include filled fields
 *
 * @param {Record<string, any>} row - The row data
 * @param {Record<string, string[]>} unfilledValues - Per-field unfilled value definitions
 * @returns {Record<string, any>} Row containing only filled fields
 */
export const filterToFilled = (row, unfilledValues) => {
  const result = {}
  for (const [field, value] of Object.entries(row)) {
    const fieldUnfilledValues = unfilledValues[field] || []
    if (isFilled(value, fieldUnfilledValues)) {
      result[field] = value
    }
  }
  return result
}

/**
 * Classifies a row based on the validation pipeline
 *
 * Pipeline steps:
 * 1. Filter to filled fields only
 * 2. VAL010: Validate filled fields against schema → REJECTED if fails
 * 3. VAL011: Check required fields are present → EXCLUDED if missing
 * 4. All pass → INCLUDED
 *
 * @param {Record<string, any>} row - The row data
 * @param {Object} tableSchema - The table schema
 * @param {Record<string, string[]>} tableSchema.unfilledValues - Per-field unfilled values
 * @param {import('joi').ObjectSchema} tableSchema.validationSchema - Joi schema for VAL010
 * @param {string[]} tableSchema.fieldsRequiredForWasteBalance - Fields required for VAL011
 * @returns {{ outcome: string, issues: Array<{ code: string, field?: string, message?: string }> }}
 */
export const classifyRow = (row, tableSchema) => {
  const { unfilledValues, validationSchema, fieldsRequiredForWasteBalance } =
    tableSchema

  // Step 1: Filter to filled fields only
  const filledFields = filterToFilled(row, unfilledValues)

  // Step 2: VAL010 - Validate filled fields
  const { error } = validationSchema.validate(filledFields)
  if (error) {
    return {
      outcome: ROW_OUTCOME.REJECTED,
      issues: error.details.map((detail) => ({
        code: 'VALIDATION_ERROR',
        field: detail.path[0],
        message: detail.message
      }))
    }
  }

  // Step 3: VAL011 - Check required fields are present
  const missingRequired = fieldsRequiredForWasteBalance.filter((field) => {
    const fieldUnfilledValues = unfilledValues[field] || []
    return !isFilled(row[field], fieldUnfilledValues)
  })

  if (missingRequired.length > 0) {
    return {
      outcome: ROW_OUTCOME.EXCLUDED,
      issues: missingRequired.map((field) => ({
        code: 'MISSING_REQUIRED_FIELD',
        field
      }))
    }
  }

  // Step 4: All pass - INCLUDED
  return {
    outcome: ROW_OUTCOME.INCLUDED,
    issues: []
  }
}
