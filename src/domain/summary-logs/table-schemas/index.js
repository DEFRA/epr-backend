import { TABLE_SCHEMAS as REPROCESSOR_INPUT } from './reprocessor-input/index.js'
import { TABLE_SCHEMAS as REPROCESSOR_OUTPUT } from './reprocessor-output/index.js'
import { TABLE_SCHEMAS as EXPORTER } from './exporter/index.js'
import { PROCESSING_TYPES } from '../meta-fields.js'

/**
 * Registry mapping processing types to their table schemas
 *
 * Each table schema defines:
 * - rowIdField: Field name containing the row identifier
 * - requiredHeaders: Headers that must be present in the table
 * - unfilledValues: Per-field values that indicate "unfilled" (e.g. dropdown placeholders)
 * - validationSchema: Joi schema for VAL010 (in-sheet validation of filled fields)
 * - wasteBalanceRequiredFields: Fields required for VAL011 (mandatory for Waste Balance)
 */
export const PROCESSING_TYPE_TABLES = {
  [PROCESSING_TYPES.REPROCESSOR_INPUT]: REPROCESSOR_INPUT,
  [PROCESSING_TYPES.REPROCESSOR_OUTPUT]: REPROCESSOR_OUTPUT,
  [PROCESSING_TYPES.EXPORTER]: EXPORTER
}
