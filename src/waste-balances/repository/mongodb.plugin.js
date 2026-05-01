import { createWasteBalancesRepository } from './mongodb.js'
import { createMongoLedgerRepository } from './ledger-mongodb.js'
import { registerRepository } from '#plugins/register-repository.js'

export const mongoWasteBalancesRepositoryPlugin = {
  name: 'wasteBalancesRepository',
  version: '1.0.0',
  dependencies: ['mongodb', 'feature-flags'],

  register: async (server) => {
    const ledgerFactory = await createMongoLedgerRepository(server.db)
    const ledgerRepository = ledgerFactory()

    const factory = await createWasteBalancesRepository(server.db, {
      ledgerRepository,
      featureFlags: server.featureFlags
    })
    const repository = factory()

    registerRepository(server, 'wasteBalancesRepository', () => repository)
  }
}
