import Joi from 'joi'
import {
  MESSAGES,
  DROPDOWN_PLACEHOLDER,
  EWC_CODES,
  RECYCLABLE_PROPORTION_METHODS,
  WASTE_DESCRIPTIONS,
  createRowIdSchema,
  createWeightFieldSchema,
  createYesNoFieldSchema,
  createDateFieldSchema,
  createPercentageFieldSchema,
  createEnumFieldSchema,
  YES_NO_VALUES
} from '../shared/index.js'
import { RECEIVED_LOADS_FIELDS as FIELDS, ROW_ID_MINIMUMS } from './fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { transformReceivedLoadsRow } from '#application/waste-records/row-transformers/received-loads-reprocessing.js'
import {
  NET_WEIGHT_MESSAGES,
  validateNetWeight
} from '../shared/validators/net-weight-validator.js'
import {
  TONNAGE_RECEIVED_MESSAGES,
  validateTonnageReceived
} from './validators/tonnage-received-validator.js'
import { ROW_OUTCOME } from '../validation-pipeline.js'
import {
  CLASSIFICATION_REASON,
  checkRequiredFields
} from '../shared/classify-helpers.js'
import { isAccreditedAtDates } from '#common/helpers/dates/accreditation.js'
import { roundToTwoDecimalPlaces } from '#common/helpers/decimal-utils.js'

/** @import {Accreditation} from '#domain/organisations/accreditation.js' */

/**
 * Fields required for waste balance calculation (Section 1)
 */
const WASTE_BALANCE_FIELDS = [
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
  FIELDS.TONNAGE_RECEIVED_FOR_RECYCLING
]

/**
 * Supplementary fields (Sections 2 & 3) - columns present in template but not required for waste balance
 */
const SUPPLEMENTARY_FIELDS = [
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
 * Table schema for RECEIVED_LOADS_FOR_REPROCESSING
 *
 * Tracks waste received for reprocessing. This schema defines:
 * - What counts as "unfilled" per field (unfilledValues)
 * - How to validate filled fields (validationSchema for VAL010)
 * - classifyForWasteBalance: classifies a row for waste balance inclusion (VAL011)
 */
export const RECEIVED_LOADS_FOR_REPROCESSING = {
  rowIdField: FIELDS.ROW_ID,
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  sheetName: 'Received',
  rowTransformer: transformReceivedLoadsRow,

  /**
   * VAL008: All columns that must be present in the uploaded file
   */
  requiredHeaders: [...WASTE_BALANCE_FIELDS, ...SUPPLEMENTARY_FIELDS],

  /**
   * Per-field values that indicate "unfilled"
   *
   * Fields not listed use the default empty check (null, undefined, '').
   * Listed fields additionally treat these specific values as unfilled,
   * typically dropdown placeholder values from the Excel template.
   */
  unfilledValues: {
    [FIELDS.EWC_CODE]: DROPDOWN_PLACEHOLDER,
    [FIELDS.DESCRIPTION_WASTE]: DROPDOWN_PLACEHOLDER,
    [FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: DROPDOWN_PLACEHOLDER,
    [FIELDS.BAILING_WIRE_PROTOCOL]: DROPDOWN_PLACEHOLDER,
    [FIELDS.HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION]: DROPDOWN_PLACEHOLDER
  },

  /**
   * VAL010: Validation schema for filled fields
   *
   * All fields are OPTIONAL - validation only applies to fields that have values.
   * Any failure here results in REJECTED (blocks entire submission).
   */
  validationSchema: Joi.object({
    [FIELDS.ROW_ID]: createRowIdSchema(
      ROW_ID_MINIMUMS.RECEIVED_LOADS_FOR_REPROCESSING
    ).optional(),
    [FIELDS.DATE_RECEIVED_FOR_REPROCESSING]: createDateFieldSchema(),
    [FIELDS.EWC_CODE]: createEnumFieldSchema(
      EWC_CODES,
      MESSAGES.MUST_BE_VALID_EWC_CODE
    ),
    [FIELDS.DESCRIPTION_WASTE]: createEnumFieldSchema(
      WASTE_DESCRIPTIONS,
      MESSAGES.MUST_BE_VALID_WASTE_DESCRIPTION
    ),
    [FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: createYesNoFieldSchema(),
    [FIELDS.GROSS_WEIGHT]: createWeightFieldSchema(),
    [FIELDS.TARE_WEIGHT]: createWeightFieldSchema(),
    [FIELDS.PALLET_WEIGHT]: createWeightFieldSchema(),
    [FIELDS.NET_WEIGHT]: createWeightFieldSchema(),
    [FIELDS.BAILING_WIRE_PROTOCOL]: createYesNoFieldSchema(),
    [FIELDS.HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION]: createEnumFieldSchema(
      RECYCLABLE_PROPORTION_METHODS,
      MESSAGES.MUST_BE_VALID_RECYCLABLE_PROPORTION_METHOD
    ),
    [FIELDS.WEIGHT_OF_NON_TARGET_MATERIALS]: createWeightFieldSchema(),
    [FIELDS.RECYCLABLE_PROPORTION_PERCENTAGE]: createPercentageFieldSchema(),
    [FIELDS.TONNAGE_RECEIVED_FOR_RECYCLING]: createWeightFieldSchema()
  })
    .custom(validateNetWeight)
    .custom(validateTonnageReceived)
    .unknown(true)
    .messages({
      ...NET_WEIGHT_MESSAGES,
      ...TONNAGE_RECEIVED_MESSAGES
    })
    .prefs({ abortEarly: false }),

  classifyForWasteBalance: (
    /** @type {Record<string, any>} */ data,
    /** @type {{ accreditation: Accreditation | null }} */ { accreditation }
  ) => {
    const missingResult = checkRequiredFields(
      data,
      WASTE_BALANCE_FIELDS,
      RECEIVED_LOADS_FOR_REPROCESSING.unfilledValues
    )
    if (missingResult) {
      return missingResult
    }

    if (
      !isAccreditedAtDates(
        [data[FIELDS.DATE_RECEIVED_FOR_REPROCESSING]],
        accreditation
      )
    ) {
      return {
        outcome: ROW_OUTCOME.IGNORED,
        reasons: [{ code: CLASSIFICATION_REASON.OUTSIDE_ACCREDITATION_PERIOD }]
      }
    }

    if (
      data[FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE] === YES_NO_VALUES.YES
    ) {
      return {
        outcome: ROW_OUTCOME.EXCLUDED,
        reasons: [{ code: CLASSIFICATION_REASON.PRN_ISSUED }]
      }
    }

    return {
      outcome: ROW_OUTCOME.INCLUDED,
      reasons: [],
      transactionAmount: roundToTwoDecimalPlaces(
        data[FIELDS.TONNAGE_RECEIVED_FOR_RECYCLING]
      )
    }
  }
}
