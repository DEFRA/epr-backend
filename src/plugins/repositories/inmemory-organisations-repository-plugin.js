import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { registerRepository } from './register-repository.js'

/**
 * @param {Object[]} [initialOrganisations]
 * @returns {import('@hapi/hapi').Plugin<void>}
 */
export function createInMemoryOrganisationsRepositoryPlugin(
  initialOrganisations
) {
  const factory = createInMemoryOrganisationsRepository(initialOrganisations)
  const repository = factory()

  return {
    name: 'organisationsRepository',
    register: (server) => {
      registerRepository(server, 'organisationsRepository', () => repository)
    }
  }
}
