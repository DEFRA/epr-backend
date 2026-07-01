import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { createMongoStreamRepository } from './stream-mongodb.js'
import { registerRepository } from '#plugins/register-repository.js'

export const mongoWasteBalanceServicePlugin = {
  name: 'wasteBalanceService',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (server) => {
    const streamFactory = await createMongoStreamRepository(server.db)
    const streamRepository = streamFactory()

    registerRepository(server, 'streamRepository', () => streamRepository)
    registerRepository(server, 'wasteBalanceService', () =>
      createWasteBalanceService(streamRepository)
    )
  }
}
