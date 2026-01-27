import { createFormSubmissionsRepository } from '#repositories/form-submissions/inmemory.js'
import { registerRepository } from './register-repository.js'

/**
 * @typedef {Object} FormSubmissionsInitialData
 * @property {Object[]} [accreditations] - Initial accreditations data
 * @property {Object[]} [registrations] - Initial registrations data
 * @property {Object[]} [organisations] - Initial organisations data
 */

/**
 * @param {FormSubmissionsInitialData} [initialData]
 * @returns {{ plugin: import('@hapi/hapi').Plugin<void>, repository: import('#repositories/form-submissions/port.js').FormSubmissionsRepository }}
 */
export function createInMemoryFormSubmissionsRepositoryPlugin(
  initialData = {}
) {
  const factory = createFormSubmissionsRepository(
    initialData.accreditations,
    initialData.registrations,
    initialData.organisations
  )
  const repository = factory()

  const plugin = {
    name: 'formSubmissionsRepository',
    register: (server) => {
      registerRepository(server, 'formSubmissionsRepository', () => repository)
    }
  }

  return { plugin, repository }
}
