import { RECEIVED_LOADS_FOR_REPROCESSING } from './received-loads-for-reprocessing.js'
import { SENT_ON_LOADS } from './sent-on-loads.js'

/**
 * REPROCESSOR_REGISTERED_ONLY summary log templates by year
 */
export const REPROCESSOR_REGISTERED_ONLY_TEMPLATES = {
  2026: {
    minVersion: 2.1,
    tables: {
      RECEIVED_LOADS_FOR_REPROCESSING,
      SENT_ON_LOADS
    }
  }
}
