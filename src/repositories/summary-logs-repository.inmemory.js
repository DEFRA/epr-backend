import { randomUUID } from 'node:crypto'

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
