import { portAdapter } from '#plugins/port-adapter.js'
import { createInMemorySystemLogsRepository } from './inmemory.js'

export function createInMemorySystemLogsRepositoryPlugin() {
  const createRepository = createInMemorySystemLogsRepository()

  return portAdapter({
    provides: 'systemLogsRepository',
    needs: [],
    build:
      () =>
      ({ logger }) =>
        createRepository(logger)
  })
}
