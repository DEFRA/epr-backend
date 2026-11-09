import Joi from 'joi'

/**
 * A UTC date-time as `Date.prototype.toISOString` writes it. Joi's `isoDate`
 * rolls a date that does not exist into a real one rather than rejecting it, so
 * a round-trip check does that instead.
 * @returns {import('joi').StringSchema}
 */
export const isoDateTimeString = () =>
  Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    .custom((value, helpers) => {
      const date = new Date(value)
      if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
        return helpers.error('string.isoDateTime')
      }
      return value
    })
    .messages({
      'string.pattern.base':
        'Date-time must be in YYYY-MM-DDTHH:mm:ss.sssZ format',
      'string.isoDateTime': 'Date-time must be a real date and time'
    })
