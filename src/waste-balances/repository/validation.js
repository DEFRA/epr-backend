import Boom from '@hapi/boom'
import { accreditationIdSchema } from './schema.js'

export const validateAccreditationId = (accreditationId) => {
  const { error, value } = accreditationIdSchema.validate(accreditationId)

  if (error) {
    throw Boom.badData(error.message)
  }

  return value
}
