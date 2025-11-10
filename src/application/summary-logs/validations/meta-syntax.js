import {
  createValidationIssues,
  VALIDATION_CATEGORY
} from '#common/validation/validation-issues.js'
import { metaSchema } from './meta-syntax.schema.js'

/**
 * Validates the syntax and format of meta section fields
 * This is a security-focused validation that runs before business logic
 *
 * @param {Object} params
 * @param {Object} params.parsed - The parsed summary log structure from the parser
 * @param {Object} [params.registration] - Unused, for signature compatibility
 * @param {string} [params.loggingContext] - Unused, for signature compatibility
 * @returns {Object} validation issues with any issues found
 */
export const validateMetaSyntax = ({ parsed }) => {
  const issues = createValidationIssues()

  const metaValues = {}
  const metaLocations = {}

  for (const [fieldName, fieldData] of Object.entries(parsed?.meta || {})) {
    metaValues[fieldName] = fieldData?.value
    metaLocations[fieldName] = fieldData?.location
  }

  const { error } = metaSchema.validate(metaValues, { abortEarly: false })

  if (error) {
    for (const detail of error.details) {
      const fieldName = detail.path[0]
      const location = metaLocations[fieldName]
        ? { ...metaLocations[fieldName] }
        : undefined

      issues.addFatal(
        VALIDATION_CATEGORY.TECHNICAL,
        `Invalid meta field '${fieldName}': ${detail.message}`,
        {
          path: `meta.${fieldName}`,
          location,
          actual: metaValues[fieldName]
        }
      )
    }
  }

  return issues
}
