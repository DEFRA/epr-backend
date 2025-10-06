export const createInMemorySummaryLogsRepository = () => {
  const storage = new Map()

  return {
    async insert(summaryLog) {
      const id = `${Date.now()}-${Math.random()}`
      storage.set(id, { ...summaryLog, _id: id })
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
