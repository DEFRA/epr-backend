import Joi from 'joi'

/**
 * Table schema for REPROCESSED_LOADS
 *
 * Tracks waste that has been processed (output from reprocessing).
 * Validation rules not yet defined - placeholder schema.
 */
export const REPROCESSED_LOADS = {
  rowIdField: 'ROW_ID',
  requiredHeaders: [],
  unfilledValues: {},
  validationSchema: Joi.object({}).unknown(true).prefs({ abortEarly: false }),
  fieldsRequiredForWasteBalance: []
}
