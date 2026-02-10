import Boom from '@hapi/boom'

import { prnInsertSchema } from './schema.js'

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
