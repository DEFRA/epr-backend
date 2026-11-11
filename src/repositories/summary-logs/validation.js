import Boom from '@hapi/boom'

/** @import { SummaryLogKey } from '#domain/summary-logs/numbers.js' */

import {
  idSchema,
  summaryLogInsertSchema,
  summaryLogKeySchema,
  summaryLogUpdateSchema
} from './schema.js'

/**
 * @template {string} Id
 * @param {Id} id
 * @returns {Id}
 */
export const validateId = (id) => {
  const { error } = idSchema.validate(id)

  if (error) {
    throw Boom.badData(error.message)
  }

  return id
}

export const validateSummaryLogInsert = (data) => {
  const { error, value } = summaryLogInsertSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badData(`Invalid summary log data: ${details}`)
  }

  return value
}

export const validateSummaryLogUpdate = (updates) => {
  const { error, value } = summaryLogUpdateSchema.validate(updates, {
    abortEarly: false,
    stripUnknown: true
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badData(`Invalid update data: ${details}`)
  }

  return value
}

/**
 * @param {SummaryLogKey} key
 * @returns {SummaryLogKey}
 */
export const validateSummaryLogKey = (key) => {
  const { error, value } = summaryLogKeySchema.validate(key, {
    abortEarly: false
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badData(`Invalid summary log key: ${details}`)
  }

  return value
}
