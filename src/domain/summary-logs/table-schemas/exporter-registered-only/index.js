import { RECEIVED_LOADS_FOR_EXPORT } from './received-loads-for-export.js'
import { LOADS_EXPORTED } from './loads-exported.js'
import { SENT_ON_LOADS } from './sent-on-loads.js'

export const MIN_TEMPLATE_VERSION = 2.1

/**
 * Table schemas for EXPORTER_REGISTERED_ONLY processing type
 */
export const TABLE_SCHEMAS = {
  RECEIVED_LOADS_FOR_EXPORT,
  LOADS_EXPORTED,
  SENT_ON_LOADS
}
