import Joi from 'joi'
import { createRowIdSchema } from './row-id.schema.js'
import {
  createDateFieldSchema,
  createWeightFieldSchema
} from './field-schemas.js'
import { SENT_ON_LOADS_FIELDS as FIELDS } from './fields.js'

/**
 * Fields required for waste balance calculation.
 * Used for fatalFields and fieldsRequiredForInclusionInWasteBalance.
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
 * Creates a SENT_ON_LOADS table schema for exporter and reprocessor-input variants.
 *
 * These variants share the same structure with all 13 fields, the same validation rules,
 * and the same waste balance calculation requirements. Only the ROW_ID minimum differs.
 *
 * @param {number} rowIdMinimum - Minimum ROW_ID value for this variant
 * @returns {object} Table schema for SENT_ON_LOADS
 */
export const createSentOnLoadsSchema = (rowIdMinimum) => ({
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
   * Fields that produce FATAL errors when validation fails.
   * Only waste balance fields cause fatal errors.
   */
  fatalFields: WASTE_BALANCE_FIELDS,

  /**
   * VAL010: Validation schema for filled fields
   */
  validationSchema: Joi.object({
    [FIELDS.ROW_ID]: createRowIdSchema(rowIdMinimum).optional(),
    [FIELDS.DATE_LOAD_LEFT_SITE]: createDateFieldSchema(),
    [FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON]: createWeightFieldSchema()
  })
    .unknown(true)
    .prefs({ abortEarly: false }),

  /**
   * VAL011: Fields required for Waste Balance calculation
   */
  fieldsRequiredForInclusionInWasteBalance: WASTE_BALANCE_FIELDS
})
