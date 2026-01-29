import Boom from '@hapi/boom'

import { idSchema } from './schema.js'

export const validateId = (id) => {
  const { error, value } = idSchema.validate(id)

  if (error) {
    throw Boom.badData(error.message)
  }

  return value
}
