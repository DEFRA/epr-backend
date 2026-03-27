import Joi from 'joi'
import {
  MESSAGES,
  DROPDOWN_PLACEHOLDER,
  EWC_CODES,
  RECYCLABLE_PROPORTION_METHODS,
  WASTE_DESCRIPTIONS,
  BASEL_CODES,
  EXPORT_CONTROLS,
  createRowIdSchema,
  createWeightFieldSchema,
  createYesNoFieldSchema,
  createDateFieldSchema,
  createThreeDigitIdSchema,
  createPercentageFieldSchema,
  createFreeTextFieldSchema,
  createEnumFieldSchema,
  YES_NO_VALUES
} from '../shared/index.js'
import { RECEIVED_LOADS_FIELDS as FIELDS, ROW_ID_MINIMUMS } from './fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createRowTransformer } from '#application/waste-records/row-transformers/create-row-transformer.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import {
  NET_WEIGHT_MESSAGES,
  validateNetWeight
} from '../shared/validators/net-weight-validator.js'
import {
  TONNAGE_EXPORT_MESSAGES,
  validateTonnageExport
} from './validators/tonnage-export-validator.js'
import { ROW_OUTCOME } from '../validation-pipeline.js'
import {
  CLASSIFICATION_REASON,
  checkRequiredFields
} from '../shared/classify-helpers.js'
import { ORS_VALIDATION_DISABLED } from '../shared/classification-reason.js'
import { isAccreditedAtDates } from '#common/helpers/dates/accreditation.js'
import { roundToTwoDecimalPlaces } from '#common/helpers/decimal-utils.js'

/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {OverseasSitesContext} from '../shared/classification-reason.js' */

/**
 * Fields required for waste balance calculation (per PAE-984 business spec).
 *
 * These are the core fields needed for tonnage calculation. Does NOT include:
 * - EXPORT_CONTROLS (audit/traceability, not required for tonnage)
 * - INTERIM_SITE_ID (only required when DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE == Yes)
 * - TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR (conditional, same as above)
 */
const WASTE_BALANCE_FIELDS = [
  FIELDS.ROW_ID,
  FIELDS.DATE_RECEIVED_FOR_EXPORT,
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
  FIELDS.TONNAGE_RECEIVED_FOR_EXPORT,
  FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED,
  FIELDS.DATE_OF_EXPORT,
  FIELDS.BASEL_EXPORT_CODE,
  FIELDS.CUSTOMS_CODES,
  FIELDS.CONTAINER_NUMBER,
  FIELDS.DATE_RECEIVED_BY_OSR,
  FIELDS.OSR_ID,
  FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE
]

/**
 * Supplementary fields - present in template but not required for waste balance.
 *
 * INTERIM_SITE_ID and TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR are
 * conditionally required when DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE == Yes,
 * but we don't enforce this at the schema level since it would require
 * conditional validation logic. Including them as supplementary means rows
 * with incomplete interim site data will still be included in waste balance.
 *
 * EXPORT_CONTROLS is an audit field, not required for tonnage calculation.
 */
const SUPPLEMENTARY_FIELDS = [
  FIELDS.INTERIM_SITE_ID,
  FIELDS.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR,
  FIELDS.EXPORT_CONTROLS
]

/**
 * Table schema for RECEIVED_LOADS_FOR_EXPORT
 *
 * Tracks waste received for export. This schema defines:
 * - What counts as "unfilled" per field (unfilledValues)
 * - How to validate filled fields (validationSchema for VAL010)
 * - classifyForWasteBalance: classifies a row for waste balance inclusion (VAL011)
 */
export const RECEIVED_LOADS_FOR_EXPORT = {
  rowIdField: FIELDS.ROW_ID,
  wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
  sheetName: 'Exported',
  rowTransformer: createRowTransformer({
    wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
    processingType: PROCESSING_TYPES.EXPORTER,
    rowIdField: FIELDS.ROW_ID
  }),

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
    [FIELDS.HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION]: DROPDOWN_PLACEHOLDER,
    [FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]: DROPDOWN_PLACEHOLDER,
    [FIELDS.EXPORT_CONTROLS]: DROPDOWN_PLACEHOLDER,
    [FIELDS.BASEL_EXPORT_CODE]: DROPDOWN_PLACEHOLDER
  },

  /**
   * VAL010: Validation schema for filled fields
   *
   * All fields are OPTIONAL - validation only applies to fields that have values.
   * Any failure here results in REJECTED (blocks entire submission).
   */
  validationSchema: Joi.object({
    [FIELDS.ROW_ID]: createRowIdSchema(
      ROW_ID_MINIMUMS.RECEIVED_LOADS_FOR_EXPORT
    ).optional(),
    [FIELDS.DATE_RECEIVED_FOR_EXPORT]: createDateFieldSchema(),
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
    [FIELDS.TONNAGE_RECEIVED_FOR_EXPORT]: createWeightFieldSchema(),
    [FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: createWeightFieldSchema(),
    [FIELDS.DATE_OF_EXPORT]: createDateFieldSchema(),
    [FIELDS.BASEL_EXPORT_CODE]: createEnumFieldSchema(
      BASEL_CODES,
      MESSAGES.MUST_BE_VALID_BASEL_CODE
    ),
    [FIELDS.CUSTOMS_CODES]: createFreeTextFieldSchema(),
    [FIELDS.CONTAINER_NUMBER]: createFreeTextFieldSchema(),
    [FIELDS.DATE_RECEIVED_BY_OSR]: createDateFieldSchema(),
    [FIELDS.OSR_ID]: createThreeDigitIdSchema(),
    [FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]: createYesNoFieldSchema(),
    [FIELDS.INTERIM_SITE_ID]: createThreeDigitIdSchema(),
    [FIELDS.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR]:
      createWeightFieldSchema(),
    [FIELDS.EXPORT_CONTROLS]: createEnumFieldSchema(
      EXPORT_CONTROLS,
      MESSAGES.MUST_BE_VALID_EXPORT_CONTROL
    )
  })
    .custom(validateNetWeight)
    .custom(validateTonnageExport)
    .unknown(true)
    .messages({
      ...NET_WEIGHT_MESSAGES,
      ...TONNAGE_EXPORT_MESSAGES
    })
    .prefs({ abortEarly: false }),

  classifyForWasteBalance: (
    /** @type {Record<string, any>} */ data,
    /** @type {{ accreditation: Accreditation | null, overseasSites: OverseasSitesContext }} */ {
      accreditation,
      overseasSites
    }
  ) => {
    const missingResult = checkRequiredFields(
      data,
      WASTE_BALANCE_FIELDS,
      RECEIVED_LOADS_FOR_EXPORT.unfilledValues
    )
    if (missingResult) {
      return missingResult
    }

    if (
      !isAccreditedAtDates(
        [data[FIELDS.DATE_OF_EXPORT], data[FIELDS.DATE_RECEIVED_BY_OSR]],
        accreditation
      )
    ) {
      return {
        outcome: ROW_OUTCOME.IGNORED,
        reasons: [{ code: CLASSIFICATION_REASON.OUTSIDE_ACCREDITATION_PERIOD }]
      }
    }

    if (overseasSites !== ORS_VALIDATION_DISABLED) {
      const ors = overseasSites[data[FIELDS.OSR_ID]]
      if (
        !ors?.validFrom ||
        new Date(ors.validFrom) > new Date(data[FIELDS.DATE_OF_EXPORT])
      ) {
        return {
          outcome: ROW_OUTCOME.EXCLUDED,
          reasons: [{ code: CLASSIFICATION_REASON.ORS_NOT_APPROVED }]
        }
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

    const interimSite =
      data[FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE] === YES_NO_VALUES.YES

    return {
      outcome: ROW_OUTCOME.INCLUDED,
      reasons: [],
      transactionAmount: roundToTwoDecimalPlaces(
        interimSite
          ? data[FIELDS.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR]
          : data[FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]
      )
    }
  }
}
