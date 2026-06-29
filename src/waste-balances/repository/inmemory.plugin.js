import { createWasteBalancesRepository } from './repository.js'
import { registerRepository } from '#plugins/register-repository.js'

/**
 * Reads the waste balance over the shared in-memory stream from
 * `server.app.streamRepository`, so `createInMemoryStreamRepositoryPlugin` must
 * register before this plugin.
 */
export function createInMemoryWasteBalancesRepositoryPlugin() {
  return {
    name: 'wasteBalancesRepository',
    register: (server) => {
      const streamRepository =
        /** @type {import('./stream-port.js').WasteBalanceStreamRepository} */ (
          server.app.streamRepository
        )
      const repository = createWasteBalancesRepository({ streamRepository })()
      registerRepository(server, 'wasteBalancesRepository', () => repository)
    }
  }
}
