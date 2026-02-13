import Joi from 'joi'
import { LOADS_EXPORTED_FIELDS as FIELDS } from './fields.js'

const ALL_FIELDS = Object.values(FIELDS)

/**
 * Table schema for LOADS_EXPORTED (EXPORTER_REGISTERED_ONLY)
 *
 * New table for registered-only exporters — tracks the export event.
 * Fields were previously part of RECEIVED_LOADS_FOR_EXPORT in the accredited template
 * but are split out here, with additional fields for refused/stopped waste tracking.
 */
export const LOADS_EXPORTED = {
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
