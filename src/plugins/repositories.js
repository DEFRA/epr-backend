import { createSummaryLogsRepository } from '../repositories/summary-logs-repository.js'

export const repositories = {
  plugin: {
    name: 'repositories',
    version: '1.0.0',
    dependencies: ['mongodb'],
    register: (server, options) => {
      const summaryLogsRepo =
        options?.summaryLogsRepository ?? createSummaryLogsRepository(server.db)

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
