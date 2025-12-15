import Joi from 'joi'
import {
  createRowIdSchema,
  createDateFieldSchema,
  createWeightFieldSchema
} from '../shared/index.js'
import { SENT_ON_LOADS_FIELDS as FIELDS, ROW_ID_MINIMUMS } from './fields.js'

/**
 * Fields required for waste balance calculation
 */
const WASTE_BALANCE_FIELDS = [
  FIELDS.ROW_ID,
  FIELDS.DATE_LOAD_LEFT_SITE,
  FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON
]

/**
 * Supplementary fields - columns present in template but not required for waste balance
 */
const SUPPLEMENTARY_FIELDS = [
  FIELDS.FINAL_DESTINATION_FACILITY_TYPE,
  FIELDS.FINAL_DESTINATION_NAME,
  FIELDS.FINAL_DESTINATION_ADDRESS,
  FIELDS.FINAL_DESTINATION_POSTCODE,
  FIELDS.FINAL_DESTINATION_EMAIL,
  FIELDS.FINAL_DESTINATION_PHONE,
  FIELDS.YOUR_REFERENCE,
  FIELDS.DESCRIPTION_WASTE,
  FIELDS.EWC_CODE,
  FIELDS.WEIGHBRIDGE_TICKET
]

/**
 * Table schema for SENT_ON_LOADS (REPROCESSOR_INPUT)
 *
 * Tracks waste sent on to other facilities.
 */
export const SENT_ON_LOADS = {
  rowIdField: FIELDS.ROW_ID,

  /**
   * VAL008: All columns that must be present in the uploaded file
   */
  requiredHeaders: [...WASTE_BALANCE_FIELDS, ...SUPPLEMENTARY_FIELDS],

  /**
   * Per-field values that indicate "unfilled"
   */
  unfilledValues: {},

  /**
   * Fields that produce FATAL errors when validation fails
   *
   * Only waste balance fields cause fatal errors.
   */
  fatalFields: WASTE_BALANCE_FIELDS,

  /**
   * VAL010: Validation schema for filled fields
   */
  validationSchema: Joi.object({
    [FIELDS.ROW_ID]: createRowIdSchema(
      ROW_ID_MINIMUMS.SENT_ON_LOADS
    ).optional(),
    [FIELDS.DATE_LOAD_LEFT_SITE]: createDateFieldSchema(),
    [FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON]: createWeightFieldSchema()
  })
    .unknown(true)
    .prefs({ abortEarly: false }),

  /**
   * VAL011: Fields required for Waste Balance calculation
   */
  fieldsRequiredForWasteBalance: WASTE_BALANCE_FIELDS
}
