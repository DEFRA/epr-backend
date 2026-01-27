import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { registerRepository } from './register-repository.js'

/**
 * Creates an in-memory organisations repository plugin for testing.
 * Returns both the plugin (for server registration) and the repository
 * (for direct test access to insert/query data).
 *
 * @param {Object[]} [initialOrganisations] - Initial organisations data
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
