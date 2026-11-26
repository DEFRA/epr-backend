import { portAdapter } from '#plugins/port-adapter.js'
import { createFormSubmissionsRepository } from './inmemory.js'

/**
 * @typedef {Object} FormSubmissionsInitialData
 * @property {Object[]} [accreditations] - Initial accreditations data
 * @property {Object[]} [registrations] - Initial registrations data
 * @property {Object[]} [organisations] - Initial organisations data
 */

/**
 * @param {FormSubmissionsInitialData} [initialData]
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

  return portAdapter({
    provides: 'formSubmissionsRepository',
    needs: [],
    build: () => () => repository
  })
}
