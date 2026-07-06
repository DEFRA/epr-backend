import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { registerDependency } from '#plugins/register-dependency.js'

/**
 * Builds the waste balance service over the shared in-memory ledger from
 * `server.app.ledgerRepository`, so `createInMemoryStreamRepositoryPlugin` must
 * register before this plugin.
 */
export function createInMemoryWasteBalanceServicePlugin() {
  return {
    name: 'wasteBalanceService',
    register: (server) => {
      const ledgerRepository =
        /** @type {import('./ledger-port.js').WasteBalanceLedgerRepository} */ (
          server.app.ledgerRepository
        )
      registerDependency(server, 'wasteBalanceService', () =>
        createWasteBalanceService(ledgerRepository)
      )
    }
  }
}
