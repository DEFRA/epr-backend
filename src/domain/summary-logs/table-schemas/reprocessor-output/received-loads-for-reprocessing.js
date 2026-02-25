import Joi from 'joi'
import { DROPDOWN_PLACEHOLDER } from '../shared/index.js'
import { RECEIVED_LOADS_FIELDS as FIELDS } from './fields.js'

/**
 * All fields - all optional for REPROCESSOR_OUTPUT
 */
const ALL_FIELDS = [
  FIELDS.ROW_ID,
  FIELDS.DATE_RECEIVED_FOR_REPROCESSING,
  FIELDS.EWC_CODE,
  FIELDS.DESCRIPTION_WASTE,
  FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE,
  FIELDS.GROSS_WEIGHT,
  FIELDS.TARE_WEIGHT,
  FIELDS.PALLET_WEIGHT,
  FIELDS.NET_WEIGHT,
  FIELDS.BAILING_WIRE_PROTOCOL,
  FIELDS.HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION,
  FIELDS.WEIGHT_OF_NON_TARGET_MATERIALS,
  FIELDS.RECYCLABLE_PROPORTION_PERCENTAGE,
  FIELDS.TONNAGE_RECEIVED_FOR_RECYCLING,
  FIELDS.SUPPLIER_NAME,
  FIELDS.SUPPLIER_ADDRESS,
  FIELDS.SUPPLIER_POSTCODE,
  FIELDS.SUPPLIER_EMAIL,
  FIELDS.SUPPLIER_PHONE_NUMBER,
  FIELDS.ACTIVITIES_CARRIED_OUT_BY_SUPPLIER,
  FIELDS.YOUR_REFERENCE,
  FIELDS.WEIGHBRIDGE_TICKET,
  FIELDS.CARRIER_NAME,
  FIELDS.CBD_REG_NUMBER,
  FIELDS.CARRIER_VEHICLE_REGISTRATION_NUMBER
]

/**
 * Table schema for RECEIVED_LOADS_FOR_REPROCESSING (REPROCESSOR_OUTPUT)
 *
 * Tracks waste received for reprocessing.
 * All fields are optional for REPROCESSOR_OUTPUT.
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
  unfilledValues: {
    [FIELDS.EWC_CODE]: DROPDOWN_PLACEHOLDER,
    [FIELDS.DESCRIPTION_WASTE]: DROPDOWN_PLACEHOLDER,
    [FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: DROPDOWN_PLACEHOLDER,
    [FIELDS.BAILING_WIRE_PROTOCOL]: DROPDOWN_PLACEHOLDER,
    [FIELDS.HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION]: DROPDOWN_PLACEHOLDER
  },

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
   * Empty - this table does not contribute to waste balance for REPROCESSOR_OUTPUT.
   */
  fieldsRequiredForInclusionInWasteBalance: []
}
