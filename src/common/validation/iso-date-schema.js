import { startOfDay, utcCalendarDate } from '#common/helpers/date-formatter.js'
import Joi from 'joi'

/**
 * A calendar date as a YYYY-MM-DD string. The round-trip check rejects
 * strings that match the pattern but name no real date (e.g. 2026-02-30),
 * which Date parsing would otherwise silently roll into the next month.
 * Callers add `.required()`, `.when(...)` etc. as the field needs.
 *
 * This is the parse boundary for `CalendarDate`: a value that survives it is
 * a real bare date, so consumers can declare it as one without re-checking.
 * @returns {import('joi').StringSchema}
 */
export const isoDateString = () =>
  Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .custom((value, helpers) => {
      const date = startOfDay(value)
      if (Number.isNaN(date.getTime()) || utcCalendarDate(date) !== value) {
        return helpers.error('string.pattern.base')
      }
      return value
    })
    .messages({ 'string.pattern.base': 'Date must be in YYYY-MM-DD format' })
