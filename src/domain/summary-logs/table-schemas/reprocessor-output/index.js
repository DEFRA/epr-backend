import {
  RECEIVED_LOADS_FOR_REPROCESSING,
  RECEIVED_LOADS_FOR_REPROCESSING_2027
} from './received-loads-for-reprocessing.js'
import { REPROCESSED_LOADS } from './reprocessed-loads.js'
import { SENT_ON_LOADS } from './sent-on-loads.js'

/**
 * REPROCESSOR_OUTPUT summary log templates by year
 */
export const REPROCESSOR_OUTPUT_TEMPLATES = {
  2026: {
    minVersion: 5,
    tableSchemas: {
      RECEIVED_LOADS_FOR_REPROCESSING,
      REPROCESSED_LOADS,
      SENT_ON_LOADS
    }
  },
  2027: {
    minVersion: 2027.01,
    maxVersion: 2027.01,
    tableSchemas: {
      RECEIVED_LOADS_FOR_REPROCESSING: RECEIVED_LOADS_FOR_REPROCESSING_2027,
      REPROCESSED_LOADS,
      SENT_ON_LOADS
    }
  }
}
