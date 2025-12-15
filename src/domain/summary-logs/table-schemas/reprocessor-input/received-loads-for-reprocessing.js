import Joi from 'joi'
import {
  MESSAGES,
  DROPDOWN_PLACEHOLDER,
  EWC_CODES,
  RECYCLABLE_PROPORTION_METHODS,
  WASTE_DESCRIPTIONS,
  createRowIdSchema,
  createWeightFieldSchema,
  createYesNoFieldSchema,
  createDateFieldSchema,
  createPercentageFieldSchema,
  createEnumFieldSchema,
  createNumberFieldSchema
} from '../shared/index.js'
import { RECEIVED_LOADS_FIELDS as FIELDS, ROW_ID_MINIMUMS } from './fields.js'
import {
  NET_WEIGHT_MESSAGES,
  validateNetWeight
} from './validators/net-weight-validator.js'
import {
  TONNAGE_RECEIVED_MESSAGES,
  validateTonnageReceived
} from './validators/tonnage-received-validator.js'

/**
 * All fields in this table - used for requiredHeaders, fatalFields,
 * and fieldsRequiredForWasteBalance since they're identical for this schema.
 */
const ALL_FIELDS = [
  FIELDS.ROW_ID,
  FIELDS.DATE_RECEIVED_FOR_REPROCESSING,
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
  FIELDS.TONNAGE_RECEIVED_FOR_RECYCLING
]

/**
 * Table schema for RECEIVED_LOADS_FOR_REPROCESSING
 *
 * Tracks waste received for reprocessing. This schema defines:
 * - What counts as "unfilled" per field (unfilledValues)
 * - How to validate filled fields (validationSchema for VAL010)
 * - Which fields must be present for Waste Balance (fieldsRequiredForWasteBalance for VAL011)
 */
export const RECEIVED_LOADS_FOR_REPROCESSING = {
  rowIdField: FIELDS.ROW_ID,

  requiredHeaders: ALL_FIELDS,

  /**
   * Per-field values that indicate "unfilled"
   *
   * Fields not listed use the default empty check (null, undefined, '').
   * Listed fields additionally treat these specific values as unfilled,
   * typically dropdown placeholder values from the Excel template.
   */
  unfilledValues: {
    [FIELDS.BAILING_WIRE_PROTOCOL]: DROPDOWN_PLACEHOLDER,
    [FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: DROPDOWN_PLACEHOLDER
  },

  /**
   * Fields that produce FATAL errors when validation fails
   *
   * ROW_ID is always fatal as it indicates tampering or corruption.
   * All fields are fatal per ticket requirements.
   */
  fatalFields: ALL_FIELDS,

  /**
   * VAL010: Validation schema for filled fields
   *
   * All fields are OPTIONAL - validation only applies to fields that have values.
   * Any failure here results in REJECTED (blocks entire submission).
   */
  validationSchema: Joi.object({
    [FIELDS.ROW_ID]: createRowIdSchema(
      ROW_ID_MINIMUMS.RECEIVED_LOADS_FOR_REPROCESSING
    ).optional(),
    [FIELDS.DATE_RECEIVED_FOR_REPROCESSING]: createDateFieldSchema(),
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
    [FIELDS.TONNAGE_RECEIVED_FOR_RECYCLING]: createNumberFieldSchema()
  })
    .custom(validateNetWeight)
    .custom(validateTonnageReceived)
    .unknown(true)
    .messages({
      ...NET_WEIGHT_MESSAGES,
      ...TONNAGE_RECEIVED_MESSAGES
    })
    .prefs({ abortEarly: false }),

  /**
   * VAL011: Fields required for Waste Balance calculation
   *
   * If any of these fields are missing (unfilled), the row is EXCLUDED
   * from the Waste Balance but still included in the submission.
   */
  fieldsRequiredForWasteBalance: ALL_FIELDS
}
