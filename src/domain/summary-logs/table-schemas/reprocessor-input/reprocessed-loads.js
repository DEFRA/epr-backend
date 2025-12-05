import Joi from 'joi'

/**
 * Table schema for REPROCESSED_LOADS (REPROCESSOR_INPUT)
 *
 * Tracks waste that has been processed.
 * This table is optional for REPROCESSOR_INPUT and doesn't directly
 * contribute to Waste Balance calculations.
 * Validation rules not yet defined - placeholder schema.
 */
export const REPROCESSED_LOADS = {
  rowIdField: 'ROW_ID',
  requiredHeaders: [],
  unfilledValues: {},
  fatalFields: ['ROW_ID'],
  validationSchema: Joi.object({}).unknown(true).prefs({ abortEarly: false }),
  fieldsRequiredForWasteBalance: []
}
