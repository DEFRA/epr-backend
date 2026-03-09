import Joi from 'joi'
import { DROPDOWN_PLACEHOLDER } from '../shared/index.js'
import { SENT_ON_LOADS_FIELDS as FIELDS } from './fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { transformSentOnLoadsRowReprocessorOutput } from '#application/waste-records/row-transformers/sent-on-loads-reprocessor-output.js'
import { createDateOnlyClassifier } from '../shared/classify-helpers.js'

/**
 * All fields - all optional for REPROCESSOR_OUTPUT
 */
const ALL_FIELDS = [
  FIELDS.ROW_ID,
  FIELDS.DATE_LOAD_LEFT_SITE,
  FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON,
  FIELDS.FINAL_DESTINATION_FACILITY_TYPE,
  FIELDS.FINAL_DESTINATION_NAME,
  FIELDS.FINAL_DESTINATION_ADDRESS,
  FIELDS.FINAL_DESTINATION_POSTCODE,
  FIELDS.FINAL_DESTINATION_EMAIL,
  FIELDS.FINAL_DESTINATION_PHONE,
  FIELDS.YOUR_REFERENCE,
  FIELDS.DESCRIPTION_WASTE
]

/**
 * Table schema for SENT_ON_LOADS (REPROCESSOR_OUTPUT)
 *
 * Tracks waste sent on to other facilities.
 * All fields are optional for REPROCESSOR_OUTPUT.
 */
export const SENT_ON_LOADS = {
  rowIdField: FIELDS.ROW_ID,
  wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
  sheetName: 'Sent on',
  rowTransformer: transformSentOnLoadsRowReprocessorOutput,

  /**
   * VAL008: All columns that must be present in the uploaded file
   */
  requiredHeaders: ALL_FIELDS,

  /**
   * Per-field values that indicate "unfilled"
   */
  unfilledValues: {
    [FIELDS.FINAL_DESTINATION_FACILITY_TYPE]: DROPDOWN_PLACEHOLDER,
    [FIELDS.DESCRIPTION_WASTE]: DROPDOWN_PLACEHOLDER
  },

  /**
   * VAL010: Validation schema for filled fields
   *
   * All fields are OPTIONAL - validation only applies to fields that have values.
   */
  validationSchema: Joi.object({}).unknown(true).prefs({ abortEarly: false }),

  /**
   * VAL011: Fields required for Waste Balance calculation
   *
   * Reprocessor-output sent-on loads do not contribute to waste balance.
   */
  fieldsRequiredForInclusionInWasteBalance: [],

  /**
   * This table does not contribute to waste balance but still needs date-range
   * checking to mark rows outside the accreditation period as IGNORED.
   */
  classifyForWasteBalance: createDateOnlyClassifier(FIELDS.DATE_LOAD_LEFT_SITE)
}
