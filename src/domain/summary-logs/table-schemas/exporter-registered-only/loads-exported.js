import Joi from 'joi'
import { LOADS_EXPORTED_FIELDS as FIELDS, ROW_ID_MINIMUMS } from './fields.js'
import {
  createRowIdSchema,
  createUnboundedWeightFieldSchema,
  createDateFieldSchema,
  createThreeDigitIdSchema,
  createEnumFieldSchema,
  createYesNoFieldSchema,
  createFreeTextFieldSchema,
  DROPDOWN_PLACEHOLDER,
  MESSAGES,
  BASEL_CODES
} from '../shared/index.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createRowTransformer } from '#application/waste-records/row-transformers/create-row-transformer.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
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
  wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
  sheetName: 'Exported (sections 2 and 3)',
  rowTransformer: createRowTransformer({
    wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
    processingType: PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY,
    rowIdField: FIELDS.ROW_ID
  }),

  /**
   * VAL008: All columns that must be present in the uploaded file
   */
  requiredHeaders: ALL_FIELDS,

  /**
   * Per-field values that indicate "unfilled"
   */
  unfilledValues: {
    [FIELDS.BASEL_EXPORT_CODE]: DROPDOWN_PLACEHOLDER,
    [FIELDS.WAS_THE_WASTE_REFUSED]: DROPDOWN_PLACEHOLDER,
    [FIELDS.WAS_THE_WASTE_STOPPED]: DROPDOWN_PLACEHOLDER,
    [FIELDS.OSR_COUNTRY]: DROPDOWN_PLACEHOLDER
  },

  /**
   * VAL010: Validation schema for filled fields
   */
  validationSchema: Joi.object({
    [FIELDS.ROW_ID]: createRowIdSchema(ROW_ID_MINIMUMS.LOADS_EXPORTED),
    [FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]:
      createUnboundedWeightFieldSchema(),
    [FIELDS.DATE_OF_EXPORT]: createDateFieldSchema(),
    [FIELDS.OSR_ID]: createThreeDigitIdSchema(),
    [FIELDS.BASEL_EXPORT_CODE]: createEnumFieldSchema(
      BASEL_CODES,
      MESSAGES.MUST_BE_VALID_BASEL_CODE
    ),
    [FIELDS.WAS_THE_WASTE_REFUSED]: createYesNoFieldSchema(),
    [FIELDS.WAS_THE_WASTE_STOPPED]: createYesNoFieldSchema(),
    [FIELDS.DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED]:
      createDateFieldSchema(),
    [FIELDS.CUSTOMS_CODES]: createFreeTextFieldSchema(),
    [FIELDS.CONTAINER_NUMBER]: createFreeTextFieldSchema()
  })
    .unknown(true)
    .prefs({ abortEarly: false }),

  /**
   * VAL011: Fields required for Waste Balance calculation
   *
   * Empty — registered-only operators have no waste balance.
   */
  fieldsRequiredForInclusionInWasteBalance: []
}
