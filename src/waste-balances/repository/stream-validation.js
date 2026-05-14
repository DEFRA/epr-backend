import Boom from '@hapi/boom'

import {
  streamEventInsertSchema,
  streamEventReadSchema
} from './stream-schema.js'

/**
 * @returns {import('./stream-schema.js').StreamEventInsert}
 */
export const validateStreamEventInsert = (data) => {
  const { error, value } = streamEventInsertSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badData(`Invalid stream event data: ${details}`)
  }

  return value
}

/**
 * @returns {import('./stream-schema.js').StreamEvent}
 */
export const validateStreamEventRead = (data) => {
  const { error, value } = streamEventReadSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badImplementation(
      `Invalid stream event ${data.id}: ${details}`
    )
  }

  return value
}
