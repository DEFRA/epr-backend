import Joi from 'joi'
import {
  DROPDOWN_PLACEHOLDER,
  createRowIdSchema,
  createDateFieldSchema,
  createWeightFieldSchema,
  createPercentageFieldSchema,
  createYesNoFieldSchema,
  YES_NO_VALUES
} from '../shared/index.js'
import {
  REPROCESSED_LOADS_FIELDS as FIELDS,
  ROW_ID_MINIMUMS
} from './fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { transformReprocessedLoadsRow } from '#application/waste-records/row-transformers/reprocessed-loads.js'
import {
  validateUkPackagingWeightProportion,
  UK_PACKAGING_WEIGHT_PROPORTION_MESSAGES
} from './validators/uk-packaging-weight-proportion-validator.js'
import { ROW_OUTCOME } from '../validation-pipeline.js'
import {
  CLASSIFICATION_REASON,
  checkRequiredFields
} from '../shared/classify-helpers.js'
import { isAccreditedAtDates } from '#common/helpers/dates/accreditation.js'
import { roundToTwoDecimalPlaces } from '#common/helpers/decimal-utils.js'

/**
 * Table schema for REPROCESSED_LOADS (REPROCESSOR_OUTPUT)
 *
 * Tracks waste that has been processed (output from reprocessing).
 */
export const REPROCESSED_LOADS = {
  rowIdField: FIELDS.ROW_ID,
  wasteRecordType: WASTE_RECORD_TYPE.PROCESSED,
  sheetName: 'Processed',
  rowTransformer: transformReprocessedLoadsRow,

  requiredHeaders: [
    FIELDS.ROW_ID,
    FIELDS.DATE_LOAD_LEFT_SITE,
    FIELDS.PRODUCT_TONNAGE,
    FIELDS.UK_PACKAGING_WEIGHT_PERCENTAGE,
    FIELDS.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION,
    FIELDS.ADD_PRODUCT_WEIGHT
  ],

  /**
   * Per-field values that indicate "unfilled"
   */
  unfilledValues: {
    [FIELDS.ADD_PRODUCT_WEIGHT]: DROPDOWN_PLACEHOLDER
  },

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
    [FIELDS.ADD_PRODUCT_WEIGHT]: createYesNoFieldSchema()
  })
    .custom(validateUkPackagingWeightProportion)
    .messages(UK_PACKAGING_WEIGHT_PROPORTION_MESSAGES)
    .unknown(true)
    .prefs({ abortEarly: false }),

  classifyForWasteBalance: (
    /** @type {Record<string, any>} */ data,
    { accreditation }
  ) => {
    const requiredFields = [
      FIELDS.PRODUCT_TONNAGE,
      FIELDS.DATE_LOAD_LEFT_SITE,
      FIELDS.UK_PACKAGING_WEIGHT_PERCENTAGE,
      FIELDS.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION,
      FIELDS.ADD_PRODUCT_WEIGHT
    ]
    const missingResult = checkRequiredFields(
      data,
      requiredFields,
      REPROCESSED_LOADS.unfilledValues
    )
    if (missingResult) {
      return missingResult
    }

    if (
      !isAccreditedAtDates([data[FIELDS.DATE_LOAD_LEFT_SITE]], accreditation)
    ) {
      return {
        outcome: ROW_OUTCOME.IGNORED,
        reasons: [{ code: CLASSIFICATION_REASON.OUTSIDE_ACCREDITATION_PERIOD }]
      }
    }

    if (data[FIELDS.ADD_PRODUCT_WEIGHT] !== YES_NO_VALUES.YES) {
      return {
        outcome: ROW_OUTCOME.EXCLUDED,
        reasons: [{ code: CLASSIFICATION_REASON.PRODUCT_WEIGHT_NOT_ADDED }]
      }
    }

    return {
      outcome: ROW_OUTCOME.INCLUDED,
      reasons: [],
      transactionAmount: roundToTwoDecimalPlaces(
        data[FIELDS.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION]
      )
    }
  }
}
