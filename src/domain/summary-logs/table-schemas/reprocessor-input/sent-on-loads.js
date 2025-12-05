import Joi from 'joi'

/**
 * Table schema for SENT_ON_LOADS
 *
 * Tracks waste sent on to other facilities.
 * Validation rules not yet defined - placeholder schema.
 */
export const SENT_ON_LOADS = {
  rowIdField: 'ROW_ID',
  requiredHeaders: [],
  unfilledValues: {},
  fatalFields: ['ROW_ID'],
  validationSchema: Joi.object({}).unknown(true).prefs({ abortEarly: false }),
  fieldsRequiredForWasteBalance: []
}
