import { createInMemoryLedgerRepository } from './ledger-inmemory.js'
import { registerDependency } from '#plugins/register-dependency.js'

export function createInMemoryStreamRepositoryPlugin() {
  return {
    name: 'ledgerRepository',
    register: (server) => {
      const ledgerRepository = createInMemoryLedgerRepository()()
      registerDependency(server, 'ledgerRepository', () => ledgerRepository)
    }
  }
}
