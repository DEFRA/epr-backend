import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'
import {
  createValidationIssues,
  VALIDATION_CATEGORY
} from '#common/validation/validation-issues.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'

/**
 * Mapping between spreadsheet material values and registration material types
 */
const MATERIAL_MAP = Object.freeze({
  Aluminium: 'aluminium',
  Fibre_based_composite: 'fibre',
  Glass: 'glass',
  Paper_and_board: 'paper',
  Plastic: 'plastic',
  Steel: 'steel',
  Wood: 'wood'
})

const VALID_REGISTRATION_MATERIALS = Object.values(MATERIAL_MAP)

/**
 * Validates that the material in the spreadsheet matches the registration's material type
 *
 * Uses functional validation pattern with helper functions instead of classes
 *
 * @param {Object} params
 * @param {Object} params.parsed - The parsed summary log structure from the parser
 * @param {Object} params.registration - The registration object from the organisations repository
 * @param {string} params.loggingContext - Logging context message
 * @returns {Object} validation issues with any issues found
 */
export const validateMaterialType = ({
  parsed,
  registration,
  loggingContext
}) => {
  const issues = createValidationIssues()

  const { material } = registration

  const materialField = parsed?.meta?.[SUMMARY_LOG_META_FIELDS.MATERIAL]
  const spreadsheetMaterial = materialField?.value

  const location = materialField?.location
    ? { ...materialField.location }
    : undefined

  if (!VALID_REGISTRATION_MATERIALS.includes(material)) {
    issues.addFatal(
      VALIDATION_CATEGORY.BUSINESS,
      'Invalid summary log: registration has unexpected material',
      {
        expected: VALID_REGISTRATION_MATERIALS,
        actual: material
      }
    )
    return issues
  }

  const expectedMaterial = MATERIAL_MAP[spreadsheetMaterial]

  if (expectedMaterial !== material) {
    issues.addFatal(
      VALIDATION_CATEGORY.BUSINESS,
      'Material does not match registration material',
      {
        path: `meta.${SUMMARY_LOG_META_FIELDS.MATERIAL}`,
        location,
        expected: expectedMaterial,
        actual: material
      }
    )
    return issues
  }

  logger.info({
    message: `Validated material: ${loggingContext}, spreadsheetMaterial=${spreadsheetMaterial}, registrationMaterial=${material}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })

  return issues
}
