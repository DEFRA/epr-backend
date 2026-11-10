import { registerDependency } from '#plugins/register-dependency.js'
import { createMongoExternalAccreditationsRepository } from './mongodb.js'

export const mongoExternalAccreditationsRepositoryPlugin = {
  name: 'externalAccreditationsRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (
    /** @type {import('@hapi/hapi').Server & {db: import('mongodb').Db}} */ server
  ) => {
    const factory = await createMongoExternalAccreditationsRepository(server.db)
    const repository = factory()

    registerDependency(
      server,
      'externalAccreditationsRepository',
      () => repository
    )
  }
}
