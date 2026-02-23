import Joi from 'joi'

/**
 * Creates a Joi validator for a comma-separated statuses query parameter.
 * @param {string[]} allowedStatuses - The list of valid status values
 * @returns {import('joi').StringSchema} Joi schema that parses and validates statuses
 */
export function createStatusesValidator(allowedStatuses) {
  return Joi.string()
    .custom((value, helpers) => {
      const statuses = value.split(',')
      const invalid = statuses.filter((s) => !allowedStatuses.includes(s))
      if (invalid.length > 0) {
        return helpers.error('any.invalid')
      }
      return statuses
    })
    .required()
    .messages({
      'any.invalid': `statuses must be one or more of: ${allowedStatuses.join(', ')}`
    })
}
