import { createSentOnLoadsSchema } from '../shared/index.js'
import { ROW_ID_MINIMUMS } from './fields.js'
import { transformSentOnLoadsRowExporter } from '#application/waste-records/row-transformers/sent-on-loads-exporter.js'

/**
 * Table schema for SENT_ON_LOADS (EXPORTER)
 *
 * Tracks waste sent on from exporters to other facilities.
 * Does not contribute to waste balance for the exporter processing type.
 */
export const SENT_ON_LOADS = {
  ...createSentOnLoadsSchema(
    ROW_ID_MINIMUMS.SENT_ON_LOADS,
    transformSentOnLoadsRowExporter
  )
}
