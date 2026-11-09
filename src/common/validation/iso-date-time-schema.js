import Joi from 'joi'

/**
 * A UTC date-time as `Date.prototype.toISOString` writes it. Joi's `isoDate`
 * rewrites any parseable value into that form rather than rejecting it, so the
 * round-trip check is what holds a value to it.
 * @returns {import('joi').StringSchema}
 */
export const isoDateTimeString = () =>
  Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    .custom((value, helpers) => {
      const date = new Date(value)
      if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
        return helpers.error('string.pattern.base')
      }
      return value
    })
    .messages({
      'string.pattern.base':
        'Date-time must be in YYYY-MM-DDTHH:mm:ss.sssZ format'
    })
