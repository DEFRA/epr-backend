import Joi from 'joi'

/**
 * A UTC date-time as `Date.prototype.toISOString` writes it. Joi's `isoDate`
 * rewrites any parseable value into that form rather than rejecting it, so the
 * round-trip check is what holds a value to it.
 * @returns {import('joi').StringSchema}
 */
export const isoDateTimeString = () =>
  Joi.string()
    .custom((value, helpers) => {
      const date = new Date(value)
      if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
        return helpers.error('string.isoDateTime')
      }
      return value
    })
    .messages({
      'string.isoDateTime':
        'Date-time must be in YYYY-MM-DDTHH:mm:ss.sssZ format'
    })
