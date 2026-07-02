import { createInMemoryReportsRepository } from './inmemory.js'
import { registerDependency } from '#plugins/register-dependency.js'

/**
 * @param {Map<string, Object>} [initialReports]
 * @returns {import('@hapi/hapi').Plugin<void>}
 */
export function createInMemoryReportsRepositoryPlugin(initialReports) {
  const factory = createInMemoryReportsRepository(initialReports)
  const repository = factory()

  return {
    name: 'reportsRepository',
    register: (server) => {
      registerDependency(server, 'reportsRepository', () => repository)
    }
  }
}
