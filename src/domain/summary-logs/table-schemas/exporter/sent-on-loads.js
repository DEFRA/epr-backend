import { createSentOnLoadsSchema } from '../shared/index.js'
import { SENT_ON_LOADS_FIELDS as FIELDS, ROW_ID_MINIMUMS } from './fields.js'
import { transformSentOnLoadsRowExporter } from '#application/waste-records/row-transformers/sent-on-loads-exporter.js'
import { createDateOnlyClassifier } from '../shared/classify-helpers.js'

/**
 * Table schema for SENT_ON_LOADS (EXPORTER)
 *
 * Tracks waste sent on from exporters to other facilities.
 * Does not contribute to waste balance — no exporter accreditation date
 * (DATE_OF_EXPORT or DATE_RECEIVED_BY_OSR) exists on this table.
 */
export const SENT_ON_LOADS = {
  ...createSentOnLoadsSchema(
    ROW_ID_MINIMUMS.SENT_ON_LOADS,
    transformSentOnLoadsRowExporter
  ),

  /**
   * This table does not contribute to waste balance but still needs date-range
   * checking to mark rows outside the accreditation period as IGNORED.
   */
  classifyForWasteBalance: createDateOnlyClassifier(FIELDS.DATE_LOAD_LEFT_SITE)
}
