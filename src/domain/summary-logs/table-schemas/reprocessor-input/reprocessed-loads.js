import Joi from 'joi'
import { REPROCESSED_LOADS_FIELDS as FIELDS } from './fields.js'

/**
 * All fields - all optional for REPROCESSOR_INPUT
 */
const ALL_FIELDS = [
  FIELDS.ROW_ID,
  FIELDS.DATE_LOAD_LEFT_SITE,
  FIELDS.PRODUCT_DESCRIPTION,
  FIELDS.END_OF_WASTE_STANDARDS,
  FIELDS.PRODUCT_TONNAGE,
  FIELDS.WEIGHBRIDGE_TICKET_NUMBER,
  FIELDS.HAULIER_NAME,
  FIELDS.HAULIER_VEHICLE_REGISTRATION_NUMBER,
  FIELDS.CUSTOMER_NAME,
  FIELDS.CUSTOMER_INVOICE_REFERENCE
]

/**
 * Table schema for REPROCESSED_LOADS (REPROCESSOR_INPUT)
 *
 * Tracks waste that has been processed.
 * This table is optional for REPROCESSOR_INPUT and doesn't directly
 * contribute to Waste Balance calculations.
 */
export const REPROCESSED_LOADS = {
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
   *
   * Only ROW_ID is fatal as it indicates tampering or corruption.
   */
  fatalFields: [FIELDS.ROW_ID],

  /**
   * VAL010: Validation schema for filled fields
   *
   * All fields are OPTIONAL - validation only applies to fields that have values.
   */
  validationSchema: Joi.object({}).unknown(true).prefs({ abortEarly: false }),

  /**
   * VAL011: Fields required for Waste Balance calculation
   *
   * Empty - this table does not contribute to waste balance for REPROCESSOR_INPUT.
   */
  fieldsRequiredForWasteBalance: []
}
