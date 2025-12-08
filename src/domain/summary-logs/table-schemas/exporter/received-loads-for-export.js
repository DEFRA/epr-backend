import Joi from 'joi'

/**
 * Table schema for RECEIVED_LOADS_FOR_EXPORT
 *
 * Tracks waste received for export (exporter-specific).
 * The LLD notes this has 50+ columns with export-specific fields.
 * Validation rules not yet defined - placeholder schema.
 */
export const RECEIVED_LOADS_FOR_EXPORT = {
  rowIdField: 'ROW_ID',
  requiredHeaders: [],
  unfilledValues: {},
  validationSchema: Joi.object({}).unknown(true).prefs({ abortEarly: false }),
  fieldsRequiredForWasteBalance: []
}
