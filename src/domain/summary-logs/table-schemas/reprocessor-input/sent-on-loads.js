import { createSentOnLoadsSchema } from '../shared/index.js'
import { ROW_ID_MINIMUMS } from './fields.js'

/**
 * Table schema for SENT_ON_LOADS (REPROCESSOR_INPUT)
 *
 * Tracks waste sent on to other facilities.
 */
export const SENT_ON_LOADS = createSentOnLoadsSchema(
  ROW_ID_MINIMUMS.SENT_ON_LOADS
)
