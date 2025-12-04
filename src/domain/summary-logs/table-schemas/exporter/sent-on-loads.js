import Joi from 'joi'

/**
 * Table schema for SENT_ON_LOADS (exporter variant)
 *
 * Tracks waste sent on from exporters.
 * May differ from reprocessor variant - separate file for flexibility.
 * Validation rules not yet defined - placeholder schema.
 */
export const SENT_ON_LOADS = {
  rowIdField: 'ROW_ID',
  requiredHeaders: [],
  unfilledValues: {},
  validationSchema: Joi.object({}).unknown(true).prefs({ abortEarly: false }),
  fieldsRequiredForWasteBalance: []
}
