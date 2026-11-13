import Joi from 'joi'

import { yearSchema } from '#common/validation/year-schema.js'
import { hasTemplatesForYear } from '#domain/summary-logs/table-schemas/index.js'

/**
 * The year an export covers when the caller names none, until every caller
 * passes one (PAE-2277).
 */
const DEFAULT_EXPORT_YEAR = 2026

/**
 * The export's `?year=`: a year with summary log templates, since no other
 * year can hold waste records.
 */
export const exportYearQuery = Joi.object({
  year: yearSchema()
    .custom((year, helpers) =>
      hasTemplatesForYear(year) ? year : helpers.error('any.invalid')
    )
    .default(DEFAULT_EXPORT_YEAR)
})
