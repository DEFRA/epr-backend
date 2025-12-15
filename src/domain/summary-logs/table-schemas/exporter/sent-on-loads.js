import Joi from 'joi'
import {
  createRowIdSchema,
  createDateFieldSchema,
  createWeightFieldSchema
} from '../shared/index.js'
import { SENT_ON_LOADS_FIELDS as FIELDS, ROW_ID_MINIMUMS } from './fields.js'

/**
 * Mandatory fields - required for data validation and waste balance
 */
const MANDATORY_FIELDS = [
  FIELDS.ROW_ID,
  FIELDS.DATE_LOAD_LEFT_SITE,
  FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON
]

/**
 * Optional fields - columns present in template but not mandatory
 */
const OPTIONAL_FIELDS = [
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
 * Table schema for SENT_ON_LOADS (EXPORTER)
 *
 * Tracks waste sent on from exporters to other facilities.
 */
export const SENT_ON_LOADS = {
  rowIdField: FIELDS.ROW_ID,

  /**
   * VAL008: All columns that must be present in the uploaded file
   */
  requiredHeaders: [...MANDATORY_FIELDS, ...OPTIONAL_FIELDS],

  /**
   * Per-field values that indicate "unfilled"
   */
  unfilledValues: {},

  /**
   * Fields that produce FATAL errors when validation fails
   *
   * Only mandatory fields cause fatal errors.
   */
  fatalFields: MANDATORY_FIELDS,

  /**
   * VAL010: Validation schema for filled fields
   *
   * All fields are OPTIONAL - validation only applies to fields that have values.
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
   *
   * Only mandatory fields are required for waste balance.
   */
  fieldsRequiredForWasteBalance: MANDATORY_FIELDS
}
