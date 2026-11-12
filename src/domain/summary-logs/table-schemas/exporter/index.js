import { RECEIVED_LOADS_FOR_EXPORT } from './received-loads-for-export.js'
import { SENT_ON_LOADS } from './sent-on-loads.js'

/**
 * EXPORTER summary log templates by year
 */
export const EXPORTER_TEMPLATES = {
  2026: {
    minVersion: 5,
    tableSchemas: {
      RECEIVED_LOADS_FOR_EXPORT,
      SENT_ON_LOADS
    }
  }
}
