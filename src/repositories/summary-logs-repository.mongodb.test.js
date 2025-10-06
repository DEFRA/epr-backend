import { createSummaryLogsRepository } from './summary-logs-repository.mongodb.js'
import { summaryLogsRepositoryContract } from './summary-logs-repository.contract.js'

describe('createSummaryLogsRepository with real MongoDB', () => {
  let server
  let repository

  beforeAll(async () => {
    const { createServer } = await import('#server/server.js')
    server = await createServer()
    await server.initialize()

    repository = createSummaryLogsRepository(server.db)
  })

  afterAll(async () => {
    await server.stop()
  })

  summaryLogsRepositoryContract(() => repository)
})
