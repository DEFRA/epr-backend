import Joi from 'joi'

/**
 * A calendar date as a YYYY-MM-DD string. The round-trip check rejects
 * strings that match the pattern but name no real date (e.g. 2026-02-30),
 * which Date parsing would otherwise silently roll into the next month.
 * Callers add `.required()`, `.when(...)` etc. as the field needs.
 * @returns {import('joi').StringSchema}
 */
export const isoDateString = () =>
  Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .custom((value, helpers) => {
      const date = new Date(`${value}T00:00:00.000Z`)
      if (
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
      ) {
        return helpers.error('string.pattern.base')
      }
      return value
    })
    .messages({ 'string.pattern.base': 'Date must be in YYYY-MM-DD format' })
