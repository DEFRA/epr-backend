import { RECEIVED_LOADS_FOR_REPROCESSING } from './received-loads-for-reprocessing.js'
import { SENT_ON_LOADS } from './sent-on-loads.js'

export const MIN_TEMPLATE_VERSION = 2

/**
 * Table schemas for REPROCESSOR_REGISTERED_ONLY processing type
 */
export const TABLE_SCHEMAS = {
  RECEIVED_LOADS_FOR_REPROCESSING,
  SENT_ON_LOADS
}
