import Joi from 'joi'

import { yearSchema } from '#common/validation/year-schema.js'
import { availableWasteRecordYears } from '#waste-records-export/domain/available-years.js'

/**
 * The export's `?year=`: a year `/waste-records/years` lists, so a year with
 * no template is refused rather than exported header-only.
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
