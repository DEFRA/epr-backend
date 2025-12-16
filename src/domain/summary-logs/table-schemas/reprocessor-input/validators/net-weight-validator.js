import {
  createNetWeightValidator,
  NET_WEIGHT_MESSAGES
} from '../../shared/validators/net-weight-validator.js'
import { RECEIVED_LOADS_FIELDS } from '../fields.js'

/**
 * Validates that NET_WEIGHT equals GROSS_WEIGHT - TARE_WEIGHT - PALLET_WEIGHT
 *
 * Uses the shared factory with reprocessor-input field names.
 */
export const validateNetWeight = createNetWeightValidator(RECEIVED_LOADS_FIELDS)

export { NET_WEIGHT_MESSAGES }
