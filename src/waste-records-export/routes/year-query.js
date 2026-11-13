import Joi from 'joi'

import { yearSchema } from '#common/validation/year-schema.js'

/**
 * The year an export covers when the caller names none, until every caller
 * passes one (PAE-2277).
 */
const DEFAULT_EXPORT_YEAR = 2026

/**
 * The export's `?year=`. A year with no waste records exports the header row
 * alone.
 */
export const exportYearQuery = Joi.object({
  year: yearSchema().default(DEFAULT_EXPORT_YEAR)
})
