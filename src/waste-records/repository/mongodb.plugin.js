import { createMongoSummaryLogRowStatesRepository } from './mongodb.js'
import { registerDependency } from '#plugins/register-dependency.js'

/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */

export const mongoSummaryLogRowStatesRepositoryPlugin = {
  name: 'summaryLogRowStatesRepository',
  version: '1.0.0',
  dependencies: ['mongodb', 'organisationsRepository'],

  register: async (server) => {
    const organisationsRepository = /** @type {OrganisationsRepository} */ (
      server.app.organisationsRepository
    )
    const factory = await createMongoSummaryLogRowStatesRepository(
      server.db,
      organisationsRepository
    )
    const repository = factory()

    registerDependency(
      server,
      'summaryLogRowStatesRepository',
      () => repository
    )
  }
}
