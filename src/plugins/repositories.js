import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'

export const repositories = {
  plugin: {
    name: 'repositories',
    version: '1.0.0',
    register: (server, options) => {
      const decorateRepository = (repoFactory) => {
        server.decorate(
          'request',
          'summaryLogsRepository',
          function () {
            const logger = this?.logger ?? {
              info: () => {},
              error: () => {},
              warn: () => {},
              debug: () => {}
            }
            return repoFactory(logger)
          },
          {
            apply: true
          }
        )
      }

      if (options?.summaryLogsRepository) {
        // Test override - wrap the repository in a factory that ignores the logger
        const testRepo = options.summaryLogsRepository
        decorateRepository(() => testRepo)
      } else {
        // Production - require MongoDB plugin
        server.dependency('mongodb', () => {
          const summaryLogsRepoFactory = createSummaryLogsRepository(server.db)
          decorateRepository(summaryLogsRepoFactory)
        })
      }
    }
  }
}
