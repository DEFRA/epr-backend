import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'

export const repositories = {
  plugin: {
    name: 'repositories',
    version: '1.0.0',
    register: (server, options) => {
      const decorateRepository = (repo) => {
        server.decorate('request', 'summaryLogsRepository', () => repo, {
          apply: true
        })
      }

      if (options?.summaryLogsRepository) {
        // Test override - no MongoDB dependency needed
        decorateRepository(options.summaryLogsRepository)
      } else {
        // Production - require MongoDB plugin
        server.dependency('mongodb', () => {
          const summaryLogsRepo = createSummaryLogsRepository(server.db)
          decorateRepository(summaryLogsRepo)
        })
      }
    }
  }
}
