import { createSentOnLoadsSchema } from '../shared/index.js'
import { SENT_ON_LOADS_FIELDS as FIELDS, ROW_ID_MINIMUMS } from './fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createRowTransformer } from '#application/waste-records/row-transformers/create-row-transformer.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

/**
 * Table schema for SENT_ON_LOADS (EXPORTER)
 *
 * Tracks waste sent on from exporters to other facilities.
 * Does not contribute to waste balance.
 */
export const SENT_ON_LOADS = createSentOnLoadsSchema(
  ROW_ID_MINIMUMS.SENT_ON_LOADS,
  createRowTransformer({
    wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
    processingType: PROCESSING_TYPES.EXPORTER,
    rowIdField: FIELDS.ROW_ID
  })
)
