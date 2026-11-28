import { portAdapter } from '#plugins/port-adapter.js'
import { createInMemoryExternalAccreditationsRepository } from './inmemory.js'

export function createInMemoryExternalAccreditationsRepositoryPlugin() {
  const createRepository = createInMemoryExternalAccreditationsRepository()

  return portAdapter({
    provides: 'externalAccreditationsRepository',
    needs: [],
    build: () => createRepository
  })
}
