import { createMongoLedgerRepository } from './ledger-mongodb.js'
import { registerDependency } from '#plugins/register-dependency.js'

export const mongoLedgerRepositoryPlugin = {
  name: 'ledgerRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (server) => {
    const ledgerFactory = await createMongoLedgerRepository(server.db)
    const ledgerRepository = ledgerFactory()

    registerDependency(server, 'ledgerRepository', () => ledgerRepository)
  }
}
