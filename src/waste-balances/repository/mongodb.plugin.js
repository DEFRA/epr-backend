import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { registerDependency } from '#plugins/register-dependency.js'

/**
 * Builds the waste balance service over the shared ledger from
 * `server.app.ledgerRepository`, so `mongoLedgerRepositoryPlugin` must register
 * before this plugin.
 */
export const mongoWasteBalanceServicePlugin = {
  name: 'wasteBalanceService',
  version: '1.0.0',
  dependencies: ['ledgerRepository'],

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
