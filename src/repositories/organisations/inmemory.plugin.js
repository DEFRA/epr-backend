import { createInMemoryOrganisationsRepository } from './inmemory.js'
import { registerDependency } from '#plugins/register-dependency.js'

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
      registerDependency(server, 'organisationsRepository', () => repository)
    }
  }
}
