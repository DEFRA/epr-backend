import Joi from 'joi'

import { openYearSchema } from '#common/validation/year-schema.js'
import { hasTemplatesForYear } from '#domain/summary-logs/table-schemas/index.js'

/**
 * The export's `?year=`: an open year with a summary log template, so a year
 * with no template is refused rather than exported header-only.
 */
export const exportYearQuery = Joi.object({
  year: openYearSchema()
    .custom((year, helpers) =>
      hasTemplatesForYear(year) ? year : helpers.error('any.invalid')
    )
    .required()
})
