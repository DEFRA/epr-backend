import Joi from 'joi'
import {
  MESSAGES,
  DROPDOWN_PLACEHOLDER,
  EWC_CODES,
  RECYCLABLE_PROPORTION_METHODS,
  WASTE_DESCRIPTIONS,
  BASEL_CODES,
  EXPORT_CONTROLS,
  createRowIdSchema,
  createWeightFieldSchema,
  createYesNoFieldSchema,
  createDateFieldSchema,
  createThreeDigitIdSchema,
  createPercentageFieldSchema,
  createAlphanumericFieldSchema,
  createEnumFieldSchema
} from '../shared/index.js'
import { RECEIVED_LOADS_FIELDS as FIELDS, ROW_ID_MINIMUMS } from './fields.js'
import {
  NET_WEIGHT_MESSAGES,
  validateNetWeight
} from '../shared/validators/net-weight-validator.js'
import {
  TONNAGE_EXPORT_MESSAGES,
  validateTonnageExport
} from './validators/tonnage-export-validator.js'

/**
 * Fields required for waste balance calculation (per PAE-984 business spec).
 *
 * These are the core fields needed for tonnage calculation. Does NOT include:
 * - EXPORT_CONTROLS (audit/traceability, not required for tonnage)
 * - INTERIM_SITE_ID (only required when DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE == Yes)
 * - TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR (conditional, same as above)
 */
const WASTE_BALANCE_FIELDS = [
  FIELDS.ROW_ID,
  FIELDS.DATE_RECEIVED_FOR_EXPORT,
  FIELDS.EWC_CODE,
  FIELDS.DESCRIPTION_WASTE,
  FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE,
  FIELDS.GROSS_WEIGHT,
  FIELDS.TARE_WEIGHT,
  FIELDS.PALLET_WEIGHT,
  FIELDS.NET_WEIGHT,
  FIELDS.BAILING_WIRE_PROTOCOL,
  FIELDS.HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION,
  FIELDS.WEIGHT_OF_NON_TARGET_MATERIALS,
  FIELDS.RECYCLABLE_PROPORTION_PERCENTAGE,
  FIELDS.TONNAGE_RECEIVED_FOR_EXPORT,
  FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED,
  FIELDS.DATE_OF_EXPORT,
  FIELDS.BASEL_EXPORT_CODE,
  FIELDS.CUSTOMS_CODES,
  FIELDS.CONTAINER_NUMBER,
  FIELDS.DATE_RECEIVED_BY_OSR,
  FIELDS.OSR_ID,
  FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE
]

/**
 * Supplementary fields - present in template but not required for waste balance.
 *
 * INTERIM_SITE_ID and TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR are
 * conditionally required when DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE == Yes,
 * but we don't enforce this at the schema level since it would require
 * conditional validation logic. Including them as supplementary means rows
 * with incomplete interim site data will still be included in waste balance.
 *
 * EXPORT_CONTROLS is an audit field, not required for tonnage calculation.
 */
const SUPPLEMENTARY_FIELDS = [
  FIELDS.INTERIM_SITE_ID,
  FIELDS.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR,
  FIELDS.EXPORT_CONTROLS
]

/**
 * Table schema for RECEIVED_LOADS_FOR_EXPORT
 *
 * Tracks waste received for export. This schema defines:
 * - What counts as "unfilled" per field (unfilledValues)
 * - How to validate filled fields (validationSchema for VAL010)
 * - Which fields must be present for inclusion in Waste Balance (fieldsRequiredForInclusionInWasteBalance for VAL011)
 */
export const RECEIVED_LOADS_FOR_EXPORT = {
  rowIdField: FIELDS.ROW_ID,

  requiredHeaders: [...WASTE_BALANCE_FIELDS, ...SUPPLEMENTARY_FIELDS],

  /**
   * Per-field values that indicate "unfilled"
   *
   * Fields not listed use the default empty check (null, undefined, '').
   * Listed fields additionally treat these specific values as unfilled,
   * typically dropdown placeholder values from the Excel template.
   */
  unfilledValues: {
    [FIELDS.BAILING_WIRE_PROTOCOL]: DROPDOWN_PLACEHOLDER,
    [FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: DROPDOWN_PLACEHOLDER,
    [FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]: DROPDOWN_PLACEHOLDER,
    [FIELDS.EXPORT_CONTROLS]: DROPDOWN_PLACEHOLDER
  },

  /**
   * Fields that produce FATAL errors when validation fails
   *
   * ROW_ID is always fatal as it indicates tampering or corruption.
   * Only waste balance fields cause fatal errors; supplementary fields
   * are optional and don't block submission.
   */
  fatalFields: WASTE_BALANCE_FIELDS,

  /**
   * VAL010: Validation schema for filled fields
   *
   * All fields are OPTIONAL - validation only applies to fields that have values.
   * Any failure here results in REJECTED (blocks entire submission).
   */
  validationSchema: Joi.object({
    [FIELDS.ROW_ID]: createRowIdSchema(
      ROW_ID_MINIMUMS.RECEIVED_LOADS_FOR_EXPORT
    ).optional(),
    [FIELDS.DATE_RECEIVED_FOR_EXPORT]: createDateFieldSchema(),
    [FIELDS.EWC_CODE]: createEnumFieldSchema(
      EWC_CODES,
      MESSAGES.MUST_BE_VALID_EWC_CODE
    ),
    [FIELDS.DESCRIPTION_WASTE]: createEnumFieldSchema(
      WASTE_DESCRIPTIONS,
      MESSAGES.MUST_BE_VALID_WASTE_DESCRIPTION
    ),
    [FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: createYesNoFieldSchema(),
    [FIELDS.GROSS_WEIGHT]: createWeightFieldSchema(),
    [FIELDS.TARE_WEIGHT]: createWeightFieldSchema(),
    [FIELDS.PALLET_WEIGHT]: createWeightFieldSchema(),
    [FIELDS.NET_WEIGHT]: createWeightFieldSchema(),
    [FIELDS.BAILING_WIRE_PROTOCOL]: createYesNoFieldSchema(),
    [FIELDS.HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION]: createEnumFieldSchema(
      RECYCLABLE_PROPORTION_METHODS,
      MESSAGES.MUST_BE_VALID_RECYCLABLE_PROPORTION_METHOD
    ),
    [FIELDS.WEIGHT_OF_NON_TARGET_MATERIALS]: createWeightFieldSchema(),
    [FIELDS.RECYCLABLE_PROPORTION_PERCENTAGE]: createPercentageFieldSchema(),
    [FIELDS.TONNAGE_RECEIVED_FOR_EXPORT]: createWeightFieldSchema(),
    [FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: createWeightFieldSchema(),
    [FIELDS.DATE_OF_EXPORT]: createDateFieldSchema(),
    [FIELDS.BASEL_EXPORT_CODE]: createEnumFieldSchema(
      BASEL_CODES,
      MESSAGES.MUST_BE_VALID_BASEL_CODE
    ),
    [FIELDS.CUSTOMS_CODES]: createAlphanumericFieldSchema(),
    [FIELDS.CONTAINER_NUMBER]: createAlphanumericFieldSchema(),
    [FIELDS.DATE_RECEIVED_BY_OSR]: createDateFieldSchema(),
    [FIELDS.OSR_ID]: createThreeDigitIdSchema(),
    [FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]: createYesNoFieldSchema(),
    [FIELDS.INTERIM_SITE_ID]: createThreeDigitIdSchema(),
    [FIELDS.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR]:
      createWeightFieldSchema(),
    [FIELDS.EXPORT_CONTROLS]: createEnumFieldSchema(
      EXPORT_CONTROLS,
      MESSAGES.MUST_BE_VALID_EXPORT_CONTROL
    )
  })
    .custom(validateNetWeight)
    .custom(validateTonnageExport)
    .unknown(true)
    .messages({
      ...NET_WEIGHT_MESSAGES,
      ...TONNAGE_EXPORT_MESSAGES
    })
    .prefs({ abortEarly: false }),

  /**
   * VAL011: Fields required for inclusion in Waste Balance
   *
   * Per PAE-984: Only the 22 business-mandated fields are required.
   * Supplementary fields (EXPORT_CONTROLS, INTERIM_SITE_ID,
   * TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR) are not required for
   * waste balance inclusion.
   */
  fieldsRequiredForInclusionInWasteBalance: WASTE_BALANCE_FIELDS
}
