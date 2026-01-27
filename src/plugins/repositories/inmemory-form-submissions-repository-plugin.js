import { createFormSubmissionsRepository } from '#repositories/form-submissions/inmemory.js'
import { registerRepository } from './register-repository.js'

/**
 * @typedef {Object} InMemoryFormSubmissionsRepositoryPluginOptions
 * @property {Object[]} [initialAccreditations] - Initial accreditations data
 * @property {Object[]} [initialRegistrations] - Initial registrations data
 * @property {Object[]} [initialOrganisations] - Initial organisations data
 */

/**
 * In-memory form submissions repository adapter plugin for testing.
 * Registers the form submissions repository directly on the request object,
 * matching the existing access pattern used by route handlers.
 *
 * This is a stateless repository - the same instance is used for all requests.
 */
export const inMemoryFormSubmissionsRepositoryPlugin = {
  name: 'formSubmissionsRepository',
  version: '1.0.0',

  /**
   * @param {import('@hapi/hapi').Server} server
   * @param {InMemoryFormSubmissionsRepositoryPluginOptions} [options]
   */
  register: (server, options = {}) => {
    const factory = createFormSubmissionsRepository(
      options.initialAccreditations,
      options.initialRegistrations,
      options.initialOrganisations
    )
    const repository = factory()

    registerRepository(server, 'formSubmissionsRepository', () => repository)
  }
}
