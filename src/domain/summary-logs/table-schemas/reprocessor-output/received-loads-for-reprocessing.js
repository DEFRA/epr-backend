import Joi from 'joi'

/**
 * Table schema for RECEIVED_LOADS_FOR_REPROCESSING (REPROCESSOR_OUTPUT)
 *
 * Tracks waste received for reprocessing.
 * Validation rules not yet defined - placeholder schema.
 */
export const RECEIVED_LOADS_FOR_REPROCESSING = {
  rowIdField: 'ROW_ID',
  requiredHeaders: [],
  unfilledValues: {},
  fatalFields: ['ROW_ID'],
  validationSchema: Joi.object({}).unknown(true).prefs({ abortEarly: false }),
  fieldsRequiredForWasteBalance: []
}
