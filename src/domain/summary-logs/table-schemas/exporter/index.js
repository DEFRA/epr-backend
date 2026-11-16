import {
  RECEIVED_LOADS_FOR_EXPORT,
  RECEIVED_LOADS_FOR_EXPORT_2027
} from './received-loads-for-export.js'
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
  },
  2027: {
    minVersion: 2027.01,
    maxVersion: 2027.01,
    tableSchemas: {
      RECEIVED_LOADS_FOR_EXPORT: RECEIVED_LOADS_FOR_EXPORT_2027,
      SENT_ON_LOADS
    }
  }
}
