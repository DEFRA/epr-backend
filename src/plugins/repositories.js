import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organistions/mongodb.js'

export const repositories = {
  plugin: {
    name: 'repositories',
    version: '1.0.0',
    register: (server, options = {}) => {
      // Define all repositories here for easy extension
      const definitions = [
        {
          key: 'summaryLogsRepository',
          factory: (db) => createSummaryLogsRepository(db)
        },
        {
          key: 'organisationsRepository',
          factory: (db) => createOrganisationsRepository(db)
        }
      ]

      const decorate = (key, repo) => {
        server.decorate('request', key, () => repo, { apply: true })
      }

      // Apply test overrides first (no MongoDB dependency)
      for (const { key } of definitions) {
        if (options?.[key]) {
          decorate(key, options[key])
        }
      }

      // For any repositories without overrides, require MongoDB and create them
      const missing = definitions.filter(({ key }) => !options?.[key])
      if (missing.length > 0) {
        server.dependency('mongodb', () => {
          for (const { key, factory } of missing) {
            const repo = factory(server.db)
            decorate(key, repo)
          }
        })
      }
    }
  }
}
