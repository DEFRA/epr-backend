import Boom from '@hapi/boom'

import {
  summaryLogRowStateInsertSchema,
  summaryLogRowStateReadSchema
} from './schema.js'

/**
 * @returns {import('./schema.js').SummaryLogRowStateInsert}
 */
export const validateSummaryLogRowStateInsert = (data) => {
  const { error, value } = summaryLogRowStateInsertSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badData(`Invalid row state data: ${details}`)
  }

  return value
}

/**
 * @returns {import('./schema.js').SummaryLogRowState}
 */
export const validateSummaryLogRowStateRead = (data) => {
  // Documents written before the ids were dropped still carry them.
  const { error, value } = summaryLogRowStateReadSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badImplementation(`Invalid row state ${data.id}: ${details}`)
  }

  return value
}
