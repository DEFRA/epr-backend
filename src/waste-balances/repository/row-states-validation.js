import Boom from '@hapi/boom'

import {
  rowStateInsertSchema,
  rowStateReadSchema
} from './row-states-schema.js'

/**
 * @returns {import('./row-states-schema.js').RowStateInsert}
 */
export const validateRowStateInsert = (data) => {
  const { error, value } = rowStateInsertSchema.validate(data, {
    abortEarly: false
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badData(`Invalid row state data: ${details}`)
  }

  return value
}

/**
 * @returns {import('./row-states-schema.js').RowState}
 */
export const validateRowStateRead = (data) => {
  const { error, value } = rowStateReadSchema.validate(data, {
    abortEarly: false
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badImplementation(`Invalid row state ${data.id}: ${details}`)
  }

  return value
}
