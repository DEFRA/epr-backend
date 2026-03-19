import { createInMemoryReportsRepository } from './inmemory.js'
import { registerRepository } from '#plugins/register-repository.js'

/**
 * @param {Map<string, Object>} [initialReports]
 * @param {Object[]} [initialPeriodicReports]
 * @returns {import('@hapi/hapi').Plugin<void>}
 */
export function createInMemoryReportsRepositoryPlugin(
  initialReports,
  initialPeriodicReports
) {
  const factory = createInMemoryReportsRepository(
    initialReports,
    initialPeriodicReports
  )
  const repository = factory()

  return {
    name: 'reportsRepository',
    register: (server) => {
      registerRepository(server, 'reportsRepository', () => repository)
    }
  }
}
