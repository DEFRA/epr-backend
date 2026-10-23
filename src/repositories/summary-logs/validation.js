import Boom from '@hapi/boom'

/** @import { SummaryLogKey } from '#domain/summary-logs/numbers.js' */

import {
  idSchema,
  summaryLogInsertSchema,
  summaryLogKeySchema,
  summaryLogNumbersSchema,
  summaryLogUpdateSchema
} from './schema.js'

export const validateId = (id) => {
  const { error, value } = idSchema.validate(id)

  if (error) {
    throw Boom.badData(error.message)
  }

  return value
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

export const validateSummaryLogNumbers = (numbers) => {
  const { error, value } = summaryLogNumbersSchema.validate(numbers, {
    abortEarly: false
  })

  if (error) {
    const details = error.details.map((d) => d.message).join('; ')
    throw Boom.badData(`Invalid numbers: ${details}`)
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
