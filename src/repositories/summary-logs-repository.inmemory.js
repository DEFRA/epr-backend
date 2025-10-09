import { validateSummaryLogInsert } from './summary-logs-repository.validation.js'

/**
 * @returns {import('./summary-logs-repository.port.js').SummaryLogsRepository}
 */
export const createInMemorySummaryLogsRepository = () => {
  const storage = new Map()

  return {
    async insert(summaryLog) {
      const validated = validateSummaryLogInsert(summaryLog)
      storage.set(validated.id, { ...validated })
      return { insertedId: validated.id }
    },

    async findById(id) {
      return storage.get(id) ?? null
    }
  }
}
