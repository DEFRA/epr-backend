import { createValidationIssues } from '#common/validation/validation-issues.js'
import { validateRegistrationNumber } from './registration-number.js'
import { validateProcessingType } from './processing-type.js'
import { validateAccreditationNumber } from './accreditation-number.js'
import { validateMaterialType } from './material-type.js'

/**
 * Validates meta fields against registration business rules
 *
 * Level 2: Meta Business Validation
 * - Validates registration number matches
 * - Validates processing type matches
 * - Validates accreditation number (if applicable)
 * - Validates material type matches
 *
 * @param {Object} params
 * @param {Object} params.parsed - The parsed summary log data
 * @param {Object} params.registration - The registration from the database
 * @param {string} params.loggingContext - Context string for logging
 * @returns {Object} Validation issues object
 */
export const validateMetaBusiness = ({
  parsed,
  registration,
  loggingContext
}) => {
  const issues = createValidationIssues()

  for (const validate of [
    validateRegistrationNumber,
    validateProcessingType,
    validateAccreditationNumber,
    validateMaterialType
  ]) {
    issues.merge(validate({ parsed, registration, loggingContext }))
  }

  return issues
}
