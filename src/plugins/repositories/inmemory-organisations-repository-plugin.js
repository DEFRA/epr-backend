import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { registerRepository } from './register-repository.js'

/**
 * @param {Object[]} [initialOrganisations]
 * @returns {{ plugin: import('@hapi/hapi').Plugin<void>, repository: import('#repositories/organisations/port.js').OrganisationsRepository }}
 */
export function createInMemoryOrganisationsRepositoryPlugin(
  initialOrganisations
) {
  const factory = createInMemoryOrganisationsRepository(initialOrganisations)
  const repository = factory()

  const plugin = {
    name: 'organisationsRepository',
    register: (server) => {
      registerRepository(server, 'organisationsRepository', () => repository)
    }
  }

  return { plugin, repository }
}
