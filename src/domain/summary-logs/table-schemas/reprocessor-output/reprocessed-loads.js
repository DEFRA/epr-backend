import Joi from 'joi'
import {
  DROPDOWN_PLACEHOLDER,
  createRowIdSchema,
  createDateFieldSchema,
  createWeightFieldSchema,
  createPercentageFieldSchema,
  createYesNoFieldSchema
} from '../shared/index.js'
import {
  REPROCESSED_LOADS_FIELDS as FIELDS,
  ROW_ID_MINIMUMS
} from './fields.js'
import {
  validateUkPackagingWeightProportion,
  UK_PACKAGING_WEIGHT_PROPORTION_MESSAGES
} from './validators/uk-packaging-weight-proportion-validator.js'

/**
 * Table schema for REPROCESSED_LOADS (REPROCESSOR_OUTPUT)
 *
 * Tracks waste that has been processed (output from reprocessing).
 */
export const REPROCESSED_LOADS = {
  rowIdField: FIELDS.ROW_ID,

  requiredHeaders: [
    FIELDS.ROW_ID,
    FIELDS.DATE_LOAD_LEFT_SITE,
    FIELDS.PRODUCT_TONNAGE,
    FIELDS.UK_PACKAGING_WEIGHT_PERCENTAGE,
    FIELDS.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION,
    FIELDS.ADD_PRODUCT_WEIGHT,
    FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE
  ],

  /**
   * Per-field values that indicate "unfilled"
   */
  unfilledValues: {
    [FIELDS.ADD_PRODUCT_WEIGHT]: DROPDOWN_PLACEHOLDER,
    [FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: DROPDOWN_PLACEHOLDER
  },

  /**
   * Fields that produce FATAL errors when validation fails
   *
   * ROW_ID is always fatal as it indicates tampering or corruption.
   * All other fields are fatal per ticket requirements (in-sheet revalidation).
   */
  fatalFields: [
    FIELDS.ROW_ID,
    FIELDS.DATE_LOAD_LEFT_SITE,
    FIELDS.PRODUCT_TONNAGE,
    FIELDS.UK_PACKAGING_WEIGHT_PERCENTAGE,
    FIELDS.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION,
    FIELDS.ADD_PRODUCT_WEIGHT,
    FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE
  ],

  /**
   * VAL010: Validation schema for filled fields
   *
   * All fields are OPTIONAL - validation only applies to fields that have values.
   */
  validationSchema: Joi.object({
    [FIELDS.ROW_ID]: createRowIdSchema(
      ROW_ID_MINIMUMS.REPROCESSED_LOADS
    ).optional(),
    [FIELDS.DATE_LOAD_LEFT_SITE]: createDateFieldSchema(),
    [FIELDS.PRODUCT_TONNAGE]: createWeightFieldSchema(),
    [FIELDS.UK_PACKAGING_WEIGHT_PERCENTAGE]: createPercentageFieldSchema(),
    [FIELDS.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION]: createWeightFieldSchema(),
    [FIELDS.ADD_PRODUCT_WEIGHT]: createYesNoFieldSchema(),
    [FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: createYesNoFieldSchema()
  })
    .custom(validateUkPackagingWeightProportion)
    .messages(UK_PACKAGING_WEIGHT_PROPORTION_MESSAGES)
    .unknown(true)
    .prefs({ abortEarly: false }),

  /**
   * VAL011: Fields required for Waste Balance calculation
   *
   * A load will only be added to your waste balance when you provide
   * all the information in this section.
   */
  fieldsRequiredForWasteBalance: [
    FIELDS.PRODUCT_TONNAGE,
    FIELDS.DATE_LOAD_LEFT_SITE,
    FIELDS.UK_PACKAGING_WEIGHT_PERCENTAGE,
    FIELDS.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION,
    FIELDS.ADD_PRODUCT_WEIGHT,
    FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE
  ]
}
