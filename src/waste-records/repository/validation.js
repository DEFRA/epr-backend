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
    abortEarly: false
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
  const { error, value } = summaryLogRowStateReadSchema.validate(data, {
    abortEarly: false
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badImplementation(`Invalid row state ${data.id}: ${details}`)
  }

  return value
}
