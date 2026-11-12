import { RECEIVED_LOADS_FOR_EXPORT } from './received-loads-for-export.js'
import { LOADS_EXPORTED } from './loads-exported.js'
import { SENT_ON_LOADS } from './sent-on-loads.js'

/**
 * EXPORTER_REGISTERED_ONLY summary log templates by year
 */
export const EXPORTER_REGISTERED_ONLY_TEMPLATES = {
  2026: {
    minVersion: 2.1,
    tableSchemas: {
      RECEIVED_LOADS_FOR_EXPORT,
      LOADS_EXPORTED,
      SENT_ON_LOADS
    }
  }
}
