import { createValidationIssues } from '#common/validation/validation-issues.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_CODE
} from '#common/enums/validation.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'
import { materialFromSpreadsheet } from '#domain/summary-logs/stored-meta.js'
import {
  buildMetaFieldLocation,
  extractMetaField,
  logValidationSuccess
} from './helpers.js'

/** @import {ValidationIssuesCollector} from '#common/validation/validation-issues.js' */
/** @import {Registration} from '#organisation-read-model/domain/model.js' */

/**
 * Validates that the material in the spreadsheet matches the registration's
 * material. A glass spreadsheet names its recycling process, which the read
 * model's material carries.
 *
 * @param {Object} params
 * @param {Object} params.parsed - The parsed summary log structure from the parser
 * @param {Pick<Registration, 'material'>} params.registration
 * @param {string} params.loggingContext - Logging context message
 * @returns {ValidationIssuesCollector} validation issues with any issues found
 */
export const validateMaterialType = ({
  parsed,
  registration,
  loggingContext
}) => {
  const issues = createValidationIssues()

  const { material: registeredMaterial } = registration

  const materialField = extractMetaField(
    parsed,
    SUMMARY_LOG_META_FIELDS.MATERIAL
  )
  const spreadsheetMaterial = materialField?.value

  const location = buildMetaFieldLocation(
    materialField,
    SUMMARY_LOG_META_FIELDS.MATERIAL
  )

  const expectedMaterial = materialFromSpreadsheet(spreadsheetMaterial)

  if (!expectedMaterial) {
    issues.addFatal(
      VALIDATION_CATEGORY.BUSINESS,
      'Material is required and must be a recognised material type',
      VALIDATION_CODE.MATERIAL_REQUIRED,
      {
        location,
        actual: spreadsheetMaterial
      }
    )
    return issues
  }

  if (expectedMaterial !== registeredMaterial) {
    issues.addFatal(
      VALIDATION_CATEGORY.BUSINESS,
      'Material does not match registration material',
      VALIDATION_CODE.MATERIAL_MISMATCH,
      {
        location,
        expected: expectedMaterial,
        actual: registeredMaterial
      }
    )
    return issues
  }

  logValidationSuccess(
    `Validated material: ${loggingContext}, spreadsheetMaterial=${spreadsheetMaterial}, registeredMaterial=${registeredMaterial}`
  )

  return issues
}
