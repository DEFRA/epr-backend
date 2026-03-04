import Joi from 'joi'
import { RECEIVED_LOADS_FIELDS as FIELDS } from './fields.js'

const ALL_FIELDS = Object.values(FIELDS)

/**
 * Table schema for RECEIVED_LOADS_FOR_REPROCESSING (REPROCESSOR_REGISTERED_ONLY)
 *
 * Simplified version of the accredited reprocessor received loads table.
 * No waste balance calculation — all fields are supplementary.
 */
export const RECEIVED_LOADS_FOR_REPROCESSING = {
  rowIdField: FIELDS.ROW_ID,

  /**
   * VAL008: All columns that must be present in the uploaded file
   */
  requiredHeaders: ALL_FIELDS,

  /**
   * Per-field values that indicate "unfilled"
   */
  unfilledValues: {},

  /**
   * Fields that produce FATAL errors when validation fails
   */
  fatalFields: [FIELDS.ROW_ID],

  /**
   * VAL010: Validation schema for filled fields
   *
   * Placeholder — accepts anything for now. Field-level validation
   * to be added when business rules are confirmed.
   */
  validationSchema: Joi.object({}).unknown(true).prefs({ abortEarly: false }),

  /**
   * VAL011: Fields required for Waste Balance calculation
   *
   * Empty — registered-only operators have no waste balance.
   */
  fieldsRequiredForInclusionInWasteBalance: []
}
