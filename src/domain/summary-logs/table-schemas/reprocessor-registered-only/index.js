import {
  RECEIVED_LOADS_FOR_REPROCESSING,
  RECEIVED_LOADS_FOR_REPROCESSING_2027
} from './received-loads-for-reprocessing.js'
import { SENT_ON_LOADS } from './sent-on-loads.js'

/**
 * REPROCESSOR_REGISTERED_ONLY summary log templates by year
 */
export const REPROCESSOR_REGISTERED_ONLY_TEMPLATES = {
  2026: {
    minVersion: 2.1,
    tableSchemas: {
      RECEIVED_LOADS_FOR_REPROCESSING,
      SENT_ON_LOADS
    }
  },
  2027: {
    minVersion: 2027.01,
    maxVersion: 2027.01,
    tableSchemas: {
      RECEIVED_LOADS_FOR_REPROCESSING: RECEIVED_LOADS_FOR_REPROCESSING_2027,
      SENT_ON_LOADS
    }
  }
}
