import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { registerDependency } from '#plugins/register-dependency.js'

/**
 * Builds the waste balance service over the shared stream from
 * `server.app.streamRepository`, so `mongoStreamRepositoryPlugin` must register
 * before this plugin.
 */
export const mongoWasteBalanceServicePlugin = {
  name: 'wasteBalanceService',
  version: '1.0.0',
  dependencies: ['streamRepository'],

  register: (server) => {
    const streamRepository =
      /** @type {import('./stream-port.js').WasteBalanceStreamRepository} */ (
        server.app.streamRepository
      )
    registerDependency(server, 'wasteBalanceService', () =>
      createWasteBalanceService(streamRepository)
    )
  }
}
