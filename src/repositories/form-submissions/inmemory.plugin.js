import { createFormSubmissionsRepository } from './inmemory.js'
import { registerRepository } from '#plugins/register-repository.js'

/**
 * @typedef {Object} FormSubmissionsInitialData
 * @property {Object[]} [accreditations] - Initial accreditations data
 * @property {Object[]} [registrations] - Initial registrations data
 * @property {Object[]} [organisations] - Initial organisations data
 */

/**
 * @param {FormSubmissionsInitialData} [initialData]
 * @returns {import('@hapi/hapi').Plugin<void>}
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

  return {
    name: 'formSubmissionsRepository',
    register: (server) => {
      registerRepository(server, 'formSubmissionsRepository', () => repository)
    }
  }
}
