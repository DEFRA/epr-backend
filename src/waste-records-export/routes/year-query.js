import Joi from 'joi'

import { yearSchema } from '#common/validation/year-schema.js'
import { availableWasteRecordYears } from '../domain/available-years.js'

/**
 * The export's `?year=`: one of {@link availableWasteRecordYears}, so a year
 * with no summary log template is refused rather than exported header-only.
 */
export const exportYearQuery = Joi.object({
  year: yearSchema()
    .custom((year, helpers) =>
      availableWasteRecordYears().includes(year)
        ? year
        : helpers.error('any.invalid')
    )
    .required()
})
