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

const isRegisteredOnlyMismatch = ({
  featureFlags,
  wasteProcessingType,
  spreadsheetProcessingType,
  registration
}) => {
  if (
    !featureFlags?.isRegisteredOnlyEnabled() ||
    !WASTE_TYPES_WITH_REGISTERED_ONLY.has(wasteProcessingType)
  ) {
    return false
  }

  const isRegisteredOnlyTemplate = REGISTERED_ONLY_PROCESSING_TYPES.has(
    spreadsheetProcessingType
  )
  const isRegisteredOnlyOrganisation =
    !registration.accreditation?.accreditationNumber

  return isRegisteredOnlyTemplate !== isRegisteredOnlyOrganisation
}

const isReprocessingTypeMismatch = (
  spreadsheetProcessingType,
  registration
) => {
  const expectedReprocessingType =
    PROCESSING_TYPE_TO_REPROCESSING_TYPE[spreadsheetProcessingType]

  return (
    expectedReprocessingType &&
    expectedReprocessingType !== registration.reprocessingType
  )
}

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
      { expected: VALID_WASTE_PROCESSING_TYPES, actual: wasteProcessingType }
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

  if (
    isRegisteredOnlyMismatch({
      featureFlags,
      wasteProcessingType,
      spreadsheetProcessingType,
      registration
    })
  ) {
    issues.addFatal(
      VALIDATION_CATEGORY.BUSINESS,
      'Summary log template type does not match registration accreditation status',
      VALIDATION_CODE.PROCESSING_TYPE_MISMATCH,
      { location, actual: spreadsheetProcessingType }
    )
    return issues
  }

  if (isReprocessingTypeMismatch(spreadsheetProcessingType, registration)) {
    issues.addFatal(
      VALIDATION_CATEGORY.BUSINESS,
      'Summary log processing type does not match registration reprocessing type',
      VALIDATION_CODE.PROCESSING_TYPE_MISMATCH,
      {
        location,
        expected: registration.reprocessingType,
        actual: spreadsheetProcessingType
      }
    )
    return issues
  }

  logValidationSuccess(
    `Summary log type validated: ${loggingContext}, spreadsheetType=${spreadsheetProcessingType}, wasteProcessingType=${wasteProcessingType}`
  )

  return issues
}
