import Boom from '@hapi/boom'

import { prnInsertSchema, prnNumbersSchema, prnReadSchema } from './schema.js'

/** @import { PrnNumbers } from './port.js' */

export const validatePrnInsert = (data) => {
  const { error, value } = prnInsertSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badData(`Invalid PRN data: ${details}`)
  }

  return value
}

export const validatePrnRead = (data) => {
  const { error, value } = prnReadSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badImplementation(`Invalid PRN document ${data.id}: ${details}`)
  }

  return value
}

/**
 * @param {PrnNumbers} numbers
 * @returns {PrnNumbers}
 */
export const validatePrnNumbers = (numbers) => {
  const { error, value } = prnNumbersSchema.validate(numbers, {
    abortEarly: false
  })

  if (error) {
    throw Boom.badRequest(error.message)
  }

  return value
}
