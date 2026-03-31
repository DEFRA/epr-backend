import { createInMemoryReportsRepository } from './inmemory.js'
import { registerRepository } from '#plugins/register-repository.js'

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
      registerRepository(server, 'reportsRepository', () => repository)
    }
  }
}
