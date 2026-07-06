import { createMongoLedgerRepository } from './ledger-mongodb.js'
import { registerDependency } from '#plugins/register-dependency.js'

export const mongoStreamRepositoryPlugin = {
  name: 'ledgerRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (server) => {
    const ledgerFactory = await createMongoLedgerRepository(server.db)
    const ledgerRepository = ledgerFactory()

    registerDependency(server, 'ledgerRepository', () => ledgerRepository)
  }
}
