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

    async findById(id) {
      const validatedId = validateId(id)
      return storage.get(validatedId) ?? null
    }
  }
}
