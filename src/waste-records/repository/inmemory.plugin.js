import { createInMemorySummaryLogRowStatesRepository } from './inmemory.js'
import { registerDependency } from '#plugins/register-dependency.js'

export function createInMemorySummaryLogRowStatesRepositoryPlugin() {
  const repository = createInMemorySummaryLogRowStatesRepository()()

  return {
    name: 'summaryLogRowStatesRepository',
    register: (server) => {
      registerDependency(
        server,
        'summaryLogRowStatesRepository',
        () => repository
      )
    }
  }
}
