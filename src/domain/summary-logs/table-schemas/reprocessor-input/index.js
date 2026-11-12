import { RECEIVED_LOADS_FOR_REPROCESSING } from './received-loads-for-reprocessing.js'
import { REPROCESSED_LOADS } from './reprocessed-loads.js'
import { SENT_ON_LOADS } from './sent-on-loads.js'

/**
 * REPROCESSOR_INPUT summary log templates by year
 */
export const REPROCESSOR_INPUT_TEMPLATES = {
  2026: {
    minVersion: 5,
    tableSchemas: {
      RECEIVED_LOADS_FOR_REPROCESSING,
      REPROCESSED_LOADS,
      SENT_ON_LOADS
    }
  }
}
