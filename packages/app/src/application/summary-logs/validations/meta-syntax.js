import { createValidationIssues } from '#common/validation/validation-issues.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_CODE
} from '#common/enums/validation.js'
import { metaSchema } from './meta-syntax.schema.js'

/**
 * Maps Joi error types to validation codes based on field name
 * @param {string} fieldName - The meta field name
 * @param {string} joiType - The Joi error type (e.g., 'any.required', 'string.pattern.base')
 * @returns {string} The appropriate validation code
 */
const mapJoiErrorToCode = (fieldName, joiType) => {
  const codeMap = {
    'any.required': {
      PROCESSING_TYPE: VALIDATION_CODE.PROCESSING_TYPE_REQUIRED,
      TEMPLATE_VERSION: VALIDATION_CODE.TEMPLATE_VERSION_REQUIRED,
      MATERIAL: VALIDATION_CODE.MATERIAL_REQUIRED,
      REGISTRATION_NUMBER: VALIDATION_CODE.REGISTRATION_REQUIRED
    },
    'any.only': {
      PROCESSING_TYPE: VALIDATION_CODE.PROCESSING_TYPE_INVALID
    },
    'string.base': {
      MATERIAL: VALIDATION_CODE.MATERIAL_REQUIRED,
      REGISTRATION_NUMBER: VALIDATION_CODE.REGISTRATION_REQUIRED
    },
    'number.min': {
      TEMPLATE_VERSION: VALIDATION_CODE.TEMPLATE_VERSION_INVALID
    },
    'number.base': {
      TEMPLATE_VERSION: VALIDATION_CODE.TEMPLATE_VERSION_INVALID
    }
  }

  return (
    codeMap[joiType]?.[fieldName] ?? VALIDATION_CODE.VALIDATION_FALLBACK_ERROR
  )
}

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
      const location = {
        ...metaLocations[fieldName],
        field: fieldName
      }

      const code = mapJoiErrorToCode(fieldName, detail.type)

      issues.addFatal(
        VALIDATION_CATEGORY.TECHNICAL,
        `Invalid meta field '${fieldName}': ${detail.message}`,
        code,
        {
          location,
          actual: metaValues[fieldName]
        }
      )
    }
  }

  return issues
}
