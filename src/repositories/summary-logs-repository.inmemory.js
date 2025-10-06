import { randomUUID } from 'node:crypto'

/**
 * @returns {import('./summary-logs-repository.port.js').SummaryLogsRepository}
 */
export const createInMemorySummaryLogsRepository = () => {
  const storage = new Map()

  return {
    async insert(summaryLog) {
      const id = randomUUID()
      storage.set(id, { ...summaryLog })
      return { insertedId: id }
    },

    async findByFileId(fileId) {
      return (
        Array.from(storage.values()).find((log) => log.fileId === fileId) ??
        null
      )
    }
  }
}
