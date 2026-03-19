import { createValidationIssues } from '#common/validation/validation-issues.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_CODE
} from '#common/enums/validation.js'
import {
  PROCESSING_TYPE_TO_REPROCESSING_TYPE,
  PROCESSING_TYPE_TO_WASTE_PROCESSING_TYPE,
  REGISTERED_ONLY_PROCESSING_TYPES,
  SUMMARY_LOG_META_FIELDS
} from '#domain/summary-logs/meta-fields.js'
import {
  buildMetaFieldLocation,
  extractMetaField,
  logValidationSuccess
} from './helpers.js'

const VALID_WASTE_PROCESSING_TYPES = [
  ...new Set(Object.values(PROCESSING_TYPE_TO_WASTE_PROCESSING_TYPE))
]

/**
 * Waste processing types that have a registered-only template counterpart
 * e.g. 'reprocessor' has REPROCESSOR_REGISTERED_ONLY
 */
const WASTE_TYPES_WITH_REGISTERED_ONLY = new Set(
  [...REGISTERED_ONLY_PROCESSING_TYPES].map(
    (pt) => PROCESSING_TYPE_TO_WASTE_PROCESSING_TYPE[pt]
  )
)

/**
 * Validates that the summary log type in the spreadsheet matches the registration's waste processing type
 *
 * Uses functional validation pattern with helper functions instead of classes
 *
 * @param {Object} params
 * @param {Object} params.parsed - The parsed summary log structure from the parser
 * @param {Object} params.registration - The registration object from the organisations repository
 * @param {string} params.loggingContext - Logging context message
 * @returns {Object} validation issues with any issues found
 */
export const validateProcessingType = ({
  parsed,
  registration,
  loggingContext,
  featureFlags
}) => {
  const issues = createValidationIssues()

  const { wasteProcessingType } = registration

  const processingTypeField = extractMetaField(
    parsed,
    SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE
  )
  const spreadsheetProcessingType = processingTypeField?.value

  const location = buildMetaFieldLocation(
    processingTypeField,
    SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE
  )

  if (!VALID_WASTE_PROCESSING_TYPES.includes(wasteProcessingType)) {
    issues.addFatal(
      VALIDATION_CATEGORY.BUSINESS,
      'Invalid summary log: registration has invalid waste processing type',
      VALIDATION_CODE.PROCESSING_TYPE_DATA_INVALID,
      {
        expected: VALID_WASTE_PROCESSING_TYPES,
        actual: wasteProcessingType
      }
    )
    return issues
  }

  const expectedWasteProcessingType =
    PROCESSING_TYPE_TO_WASTE_PROCESSING_TYPE[spreadsheetProcessingType]

  if (expectedWasteProcessingType !== wasteProcessingType) {
    issues.addFatal(
      VALIDATION_CATEGORY.BUSINESS,
      'Summary log processing type does not match registration waste processing type',
      VALIDATION_CODE.PROCESSING_TYPE_MISMATCH,
      {
        location,
        expected: wasteProcessingType,
        actual: spreadsheetProcessingType
      }
    )
    return issues
  }

  // Validate accredited vs registered-only template matches registration
  // Only applies when registered-only is enabled AND a registered-only
  // counterpart exists for this waste processing type
  if (
    featureFlags?.isRegisteredOnlyEnabled() &&
    WASTE_TYPES_WITH_REGISTERED_ONLY.has(wasteProcessingType)
  ) {
    const isRegisteredOnlyTemplate = REGISTERED_ONLY_PROCESSING_TYPES.has(
      spreadsheetProcessingType
    )
    const isAccreditedRegistration = Boolean(
      registration.accreditation?.accreditationNumber
    )

    if (isRegisteredOnlyTemplate !== !isAccreditedRegistration) {
      issues.addFatal(
        VALIDATION_CATEGORY.BUSINESS,
        'Summary log template type does not match registration accreditation status',
        VALIDATION_CODE.PROCESSING_TYPE_MISMATCH,
        {
          location,
          actual: spreadsheetProcessingType
        }
      )
      return issues
    }
  }

  // For reprocessors, also validate that reprocessingType (input/output) matches
  const expectedReprocessingType =
    PROCESSING_TYPE_TO_REPROCESSING_TYPE[spreadsheetProcessingType]

  if (expectedReprocessingType) {
    const { reprocessingType } = registration

    if (expectedReprocessingType !== reprocessingType) {
      issues.addFatal(
        VALIDATION_CATEGORY.BUSINESS,
        'Summary log processing type does not match registration reprocessing type',
        VALIDATION_CODE.PROCESSING_TYPE_MISMATCH,
        {
          location,
          expected: reprocessingType,
          actual: spreadsheetProcessingType
        }
      )
      return issues
    }
  }

  logValidationSuccess(
    `Summary log type validated: ${loggingContext}, spreadsheetType=${spreadsheetProcessingType}, wasteProcessingType=${wasteProcessingType}`
  )

  return issues
}
