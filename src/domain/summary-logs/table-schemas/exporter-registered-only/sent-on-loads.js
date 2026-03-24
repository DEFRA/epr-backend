import Joi from 'joi'
import { SENT_ON_LOADS_FIELDS as FIELDS, ROW_ID_MINIMUMS } from './fields.js'
import {
  createRowIdSchema,
  createUnboundedWeightFieldSchema,
  createDateFieldSchema
} from '../shared/index.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { transformSentOnLoadsRowExporterRegisteredOnly } from '#application/waste-records/row-transformers/sent-on-loads-exporter-registered-only.js'
const ALL_FIELDS = Object.values(FIELDS)

/**
 * Table schema for SENT_ON_LOADS (EXPORTER_REGISTERED_ONLY)
 *
 * Simplified version of the accredited exporter sent-on-loads table.
 * Drops supplementary fields (email, phone, reference, waste description,
 * EWC code, weighbridge ticket) that are not required for registered-only.
 */
export const SENT_ON_LOADS = {
  rowIdField: FIELDS.ROW_ID,
  wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
  sheetName: 'Sent on (section 4)',
  rowTransformer: transformSentOnLoadsRowExporterRegisteredOnly,

  /**
   * VAL008: All columns that must be present in the uploaded file
   */
  requiredHeaders: ALL_FIELDS,

  /**
   * Per-field values that indicate "unfilled"
   */
  unfilledValues: {},

  /**
   * VAL010: Validation schema for filled fields
   */
  validationSchema: Joi.object({
    [FIELDS.ROW_ID]: createRowIdSchema(ROW_ID_MINIMUMS.SENT_ON_LOADS),
    [FIELDS.DATE_LOAD_LEFT_SITE]: createDateFieldSchema(),
    [FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON]:
      createUnboundedWeightFieldSchema()
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
