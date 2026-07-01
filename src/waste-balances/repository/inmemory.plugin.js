import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { registerRepository } from '#plugins/register-repository.js'

/**
 * Builds the waste balance service over the shared in-memory stream from
 * `server.app.streamRepository`, so `createInMemoryStreamRepositoryPlugin` must
 * register before this plugin.
 */
export function createInMemoryWasteBalanceServicePlugin() {
  return {
    name: 'wasteBalanceService',
    register: (server) => {
      const streamRepository =
        /** @type {import('./stream-port.js').WasteBalanceStreamRepository} */ (
          server.app.streamRepository
        )
      registerRepository(server, 'wasteBalanceService', () =>
        createWasteBalanceService(streamRepository)
      )
    }
  }
}
