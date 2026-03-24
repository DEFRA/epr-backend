import { CLASSIFICATION_REASON } from './shared/classification-reason.js'

/** @import {Accreditation} from '#domain/organisations/accreditation.js' */

/**
 * Validation pipeline for summary log rows
 *
 * Implements the three-outcome classification model:
 * - REJECTED: Fails VAL010 (in-sheet validation of filled fields) → blocks submission
 * - EXCLUDED: Fails VAL011 (missing required fields) → excluded from Waste Balance
 * - INCLUDED: Passes all validation → contributes to Waste Balance
 */

/**
 * Row classification outcome type
 *
 * @typedef {'REJECTED'|'EXCLUDED'|'INCLUDED'|'IGNORED'} RowOutcome
 */

/**
 * Result of classifying a row for waste balance calculation.
 *
 * - INCLUDED: row contributes to waste balance with a transaction amount
 * - EXCLUDED/IGNORED: row does not contribute (missing fields, PRN issued, outside date range, etc.)
 *
 * @typedef {Object} WasteBalanceClassificationReason
 * @property {string} code - The reason code (e.g. MISSING_REQUIRED_FIELD, PRN_ISSUED)
 * @property {string} [field] - The field name, when the reason is field-specific
 */

/**
 * @typedef {{ outcome: 'INCLUDED', reasons: WasteBalanceClassificationReason[], transactionAmount: number }} WasteBalanceIncludedResult
 */

/**
 * @typedef {{ outcome: 'EXCLUDED' | 'IGNORED', reasons: WasteBalanceClassificationReason[] }} WasteBalanceExcludedResult
 */

/**
 * @typedef {WasteBalanceIncludedResult | WasteBalanceExcludedResult} WasteBalanceClassificationResult
 */

/**
 * Classifies a row for waste balance calculation.
 *
 * @callback ClassifyForWasteBalance
 * @param {Record<string, any>} data - The row data
 * @param {{ accreditation: Accreditation | null, overseasSites?: Record<number, { validFrom: Date | null }> }} context - Classification context; accreditation is null when absent
 * @returns {WasteBalanceClassificationResult}
 */

/**
 * Row classification outcomes
 *
 * @type {Readonly<{REJECTED: 'REJECTED', EXCLUDED: 'EXCLUDED', INCLUDED: 'INCLUDED', IGNORED: 'IGNORED'}>}
 */
export const ROW_OUTCOME = Object.freeze({
  REJECTED: 'REJECTED',
  EXCLUDED: 'EXCLUDED',
  INCLUDED: 'INCLUDED',
  IGNORED: 'IGNORED'
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
 * @param {readonly string[]} [unfilledValues=[]] - Field-specific values that indicate "unfilled"
 * @returns {boolean} True if the value is filled
 */
export const isFilled = (value, unfilledValues = []) => {
  if (value === null || value === undefined || value === '') {
    return false
  }
  const trimmed = typeof value === 'string' ? value.trim() : value
  return !unfilledValues.includes(trimmed)
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
 * Issue from validation pipeline when a field fails schema validation (VAL010)
 * @typedef {{ code: 'VALIDATION_ERROR', field?: string | number, message?: string, type: string }} ValidationErrorIssue
 */

/**
 * Issue from validation pipeline when a required field is missing (VAL011)
 * @typedef {{ code: 'MISSING_REQUIRED_FIELD', field: string, message?: undefined }} MissingFieldIssue
 */

/**
 * Union of all issue types from the validation pipeline
 * @typedef {ValidationErrorIssue | MissingFieldIssue} RowClassificationIssue
 */

/**
 * Maps a classifyForWasteBalance result to a classifyRow result.
 *
 * Only MISSING_REQUIRED_FIELD reasons are relevant to the validation pipeline.
 * Other exclusion reasons (PRN_ISSUED, OUTSIDE_ACCREDITATION_PERIOD) indicate
 * the row had all required fields but was excluded for waste balance reasons —
 * from classifyRow's perspective, those rows are INCLUDED (passed validation).
 *
 * @param {WasteBalanceClassificationResult} wasteBalanceResult
 * @returns {{ outcome: RowOutcome, issues: RowClassificationIssue[] }}
 */
const mapWasteBalanceResult = (wasteBalanceResult) => {
  const missingFieldReasons = wasteBalanceResult.reasons.filter(
    (reason) => reason.code === CLASSIFICATION_REASON.MISSING_REQUIRED_FIELD
  )

  if (missingFieldReasons.length > 0) {
    return {
      outcome: ROW_OUTCOME.EXCLUDED,
      issues: missingFieldReasons.map((reason) => ({
        code: CLASSIFICATION_REASON.MISSING_REQUIRED_FIELD,
        field: /** @type {string} */ (reason.field)
      }))
    }
  }

  // EXCLUDED with no reasons means the table does not contribute to waste balance
  if (
    wasteBalanceResult.outcome === ROW_OUTCOME.EXCLUDED &&
    wasteBalanceResult.reasons.length === 0
  ) {
    return {
      outcome: ROW_OUTCOME.EXCLUDED,
      issues: []
    }
  }

  // INCLUDED or EXCLUDED/IGNORED for non-missing-field reasons (e.g. PRN_ISSUED)
  // means all required fields were present — row passes validation
  return {
    outcome: ROW_OUTCOME.INCLUDED,
    issues: []
  }
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
 * @param {ClassifyForWasteBalance | null} tableSchema.classifyForWasteBalance - Waste balance classifier
 * @returns {{ outcome: RowOutcome, issues: RowClassificationIssue[] }}
 */
export const classifyRow = (row, tableSchema) => {
  const { unfilledValues, validationSchema } = tableSchema

  // Step 1: Filter to filled fields only
  const filledFields = filterToFilled(row, unfilledValues)

  // Step 2: VAL010 - Validate filled fields
  const { error } = validationSchema.validate(filledFields)
  if (error) {
    return {
      outcome: ROW_OUTCOME.REJECTED,
      issues: error.details.map((detail) => ({
        code: 'VALIDATION_ERROR',
        // For field-level validators, path[0] contains the field name
        // For object-level custom validators (e.g., calculation checks),
        // path is empty but field is passed via context.field
        field: detail.path[0] ?? detail.context?.field,
        message: detail.message,
        type: detail.type // Include Joi error type for application-layer mapping
      }))
    }
  }

  // Step 3: VAL011 - Check required fields are present
  // Schemas without classifyForWasteBalance have no waste balance, so all
  // rows are EXCLUDED — there's nothing to include them in.
  if (!tableSchema.classifyForWasteBalance) {
    return {
      outcome: ROW_OUTCOME.EXCLUDED,
      issues: []
    }
  }

  // The validation pipeline only needs the required-fields check from
  // classifyForWasteBalance. Accreditation is null because the pipeline
  // doesn't have that context — isAccreditedAtDates treats
  // null accreditation as "within range", so subsequent checks are skipped.
  const wasteBalanceResult = tableSchema.classifyForWasteBalance(row, {
    accreditation: null
  })
  return mapWasteBalanceResult(wasteBalanceResult)
}
