import Boom from '@hapi/boom'
import {
  validateId,
  validateSummaryLogInsert,
  validateSummaryLogUpdate
} from './validation.js'

/**
 * @param {import('#common/helpers/logging/logger.js').TypedLogger} logger
 * @returns {import('./port.js').SummaryLogsRepository}
 */
export const createInMemorySummaryLogsRepository = (logger) => {
  const storage = new Map()

  return {
    async insert(summaryLog) {
      const validated = validateSummaryLogInsert(summaryLog)

      if (storage.has(validated.id)) {
        throw Boom.conflict(
          `Summary log with id ${validated.id} already exists`
        )
      }

      storage.set(validated.id, structuredClone({ ...validated, version: 1 }))
    },

    async update(id, version, updates) {
      const validatedId = validateId(id)
      const validatedUpdates = validateSummaryLogUpdate(updates)

      const existing = storage.get(validatedId)

      if (!existing) {
        throw Boom.notFound(`Summary log with id ${validatedId} not found`)
      }

      if (existing.version !== version) {
        throw Boom.conflict(
          `Version conflict: attempted to update with version ${version} but current version is ${existing.version}`
        )
      }

      storage.set(
        validatedId,
        structuredClone({
          ...existing,
          ...validatedUpdates,
          version: existing.version + 1
        })
      )
    },

    async findById(id) {
      const validatedId = validateId(id)
      const result = storage.get(validatedId)
      return result ? structuredClone(result) : null
    }
  }
}
