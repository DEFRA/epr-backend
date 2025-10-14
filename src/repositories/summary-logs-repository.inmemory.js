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

      storage.set(validated.id, { ...validated })
    },

    async update(id, updates) {
      const validatedId = validateId(id)

      if (!storage.has(validatedId)) {
        throw Boom.notFound(`Summary log with id ${validatedId} not found`)
      }

      const existing = storage.get(validatedId)
      storage.set(validatedId, { ...existing, ...updates })
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
