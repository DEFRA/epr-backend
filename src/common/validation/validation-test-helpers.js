/** @import {Schema, ValidationErrorItem, ValidationOptions} from 'joi' */

/**
 * Validates `input` against `schema`, asserting that a validation error was
 * raised, and returns its (non-optional) details for further assertions. Use in
 * tests exercising the failure path instead of optional-chaining `error?.details`.
 *
 * @param {Schema} schema
 * @param {unknown} input
 * @param {ValidationOptions} [options]
 * @returns {ValidationErrorItem[]}
 */
export const expectValidationError = (schema, input, options) => {
  const { error } = schema.validate(input, options)

  if (!error) {
    throw new Error('expected a validation error but none was raised')
  }

  return error.details
}
