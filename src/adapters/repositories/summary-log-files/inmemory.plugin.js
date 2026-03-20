import { createInMemorySummaryLogFilesRepository } from './inmemory.js'
import { registerRepository } from '#plugins/register-repository.js'

/**
 * @param {Object} [config]
 * @returns {import('@hapi/hapi').Plugin<void>}
 */
export function createInMemorySummaryLogFilesRepositoryPlugin(config) {
  const repository = createInMemorySummaryLogFilesRepository(config)

  return {
    name: 'summaryLogFilesRepository',
    register: (server) => {
      registerRepository(server, 'summaryLogFilesRepository', () => repository)
    }
  }
}
