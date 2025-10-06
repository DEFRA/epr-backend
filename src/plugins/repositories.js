import { createSummaryLogsRepository } from '#repositories/summary-logs-repository.mongodb.js'

export const repositories = {
  plugin: {
    name: 'repositories',
    version: '1.0.0',
    dependencies: ['mongodb'],
    register: (server, options) => {
      const summaryLogsRepo =
        options?.summaryLogsRepository ?? // Test override
        createSummaryLogsRepository(server.db) // Production default: MongoDB

      server.decorate(
        'request',
        'summaryLogsRepository',
        () => summaryLogsRepo,
        {
          apply: true
        }
      )
    }
  }
}
