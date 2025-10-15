import Boom from '@hapi/boom'
import {
  validateId,
  validateSummaryLogInsert
} from './summary-logs-repository.validation.js'

/**
 * @returns {import('./summary-logs-repository.port.js').SummaryLogsRepository}
 */
export const createInMemorySummaryLogsRepository = () => {
  const storage = new Map()

  return {
    async insert(summaryLog) {
      const validated = validateSummaryLogInsert(summaryLog)

      if (storage.has(validated.id)) {
        throw Boom.conflict(
          `Summary log with id ${validated.id} already exists`
        )
      }

      storage.set(validated.id, { ...validated, version: 1 })
    },

    async update(id, version, updates) {
      const validatedId = validateId(id)

      const existing = storage.get(validatedId)

      if (!existing) {
        throw Boom.notFound(`Summary log with id ${validatedId} not found`)
      }

      if (existing.version !== version) {
        throw Boom.conflict(
          `Version conflict: attempted to update with version ${version} but current version is ${existing.version}`
        )
      }

      storage.set(validatedId, {
        ...existing,
        ...updates,
        version: existing.version + 1
      })
    },

    async findById(id) {
      const validatedId = validateId(id)
      return storage.get(validatedId) ?? null
    },

    async updateStatus(id, status) {
      const validatedId = validateId(id)
      const existing = storage.get(validatedId)

      if (!existing) {
        throw Boom.notFound(`Summary log with id ${validatedId} not found`)
      }

      const updated = { ...existing, status }
      storage.set(validatedId, updated)
    }
  }
}
