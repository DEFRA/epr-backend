import { createValidationIssues } from '#common/validation/validation-issues.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_CODE
} from '#common/enums/validation.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'
import {
  buildMetaFieldLocation,
  extractMetaField,
  logValidationSuccess
} from './helpers.js'

/**
 * Mapping between spreadsheet material values and registration material types
 */
const MATERIAL_MAP = Object.freeze({
  Aluminium: 'aluminium',
  Fibre_based_composite: 'fibre',
  Glass_remelt: 'glass',
  Glass_other: 'glass',
  Paper_and_board: 'paper',
  Plastic: 'plastic',
  Steel: 'steel',
  Wood: 'wood'
})

/**
 * Maps glass spreadsheet values to the required glassRecyclingProcess value
 */
const GLASS_PROCESS_MAP = Object.freeze({
  Glass_remelt: 'glass_re_melt',
  Glass_other: 'glass_other'
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

  const materialField = extractMetaField(
    parsed,
    SUMMARY_LOG_META_FIELDS.MATERIAL
  )
  const spreadsheetMaterial = materialField?.value

  const location = buildMetaFieldLocation(
    materialField,
    SUMMARY_LOG_META_FIELDS.MATERIAL
  )

  if (!VALID_REGISTRATION_MATERIALS.includes(material)) {
    issues.addFatal(
      VALIDATION_CATEGORY.BUSINESS,
      'Invalid summary log: registration has invalid material',
      VALIDATION_CODE.MATERIAL_DATA_INVALID,
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
      VALIDATION_CODE.MATERIAL_MISMATCH,
      {
        location,
        expected: expectedMaterial,
        actual: material
      }
    )
    return issues
  }

  // For glass materials, validate the recycling process matches
  const requiredGlassProcess = GLASS_PROCESS_MAP[spreadsheetMaterial]
  if (requiredGlassProcess) {
    const { glassRecyclingProcess } = registration
    if (!glassRecyclingProcess?.includes(requiredGlassProcess)) {
      issues.addFatal(
        VALIDATION_CATEGORY.BUSINESS,
        'Glass recycling process does not match registration',
        VALIDATION_CODE.MATERIAL_MISMATCH,
        {
          location,
          expected: requiredGlassProcess,
          actual: glassRecyclingProcess
        }
      )
      return issues
    }
  }

  logValidationSuccess(
    `Validated material: ${loggingContext}, spreadsheetMaterial=${spreadsheetMaterial}, registrationMaterial=${material}`
  )

  return issues
}
