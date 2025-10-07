import { randomUUID } from 'node:crypto'
import { validateSummaryLogInsert } from './summary-logs-repository.validation.js'

/**
 * @returns {import('./summary-logs-repository.port.js').SummaryLogsRepository}
 */
export const createInMemorySummaryLogsRepository = () => {
  const storage = new Map()

  return {
    async insert(summaryLog) {
      const validated = validateSummaryLogInsert(summaryLog)
      const id = randomUUID()
      storage.set(id, { ...validated })
      return { insertedId: id }
    },

    async findByFileId(fileId) {
      return (
        Array.from(storage.values()).find((log) => log.fileId === fileId) ??
        null
      )
    },

    async findBySummaryLogId(summaryLogId) {
      return (
        Array.from(storage.values()).find(
          (log) => log.summaryLogId === summaryLogId
        ) ?? null
      )
    }
  }
}
