import { createApiWasteOrganisationsService } from './api-adapter.js'
import { registerRepository } from '#plugins/register-repository.js'

/**
 * Hapi plugin that registers the waste organisations service on the request object.
 * @type {import('@hapi/hapi').Plugin<void>}
 */
export const wasteOrganisationsPlugin = {
  name: 'wasteOrganisationsService',
  register: (server) => {
    registerRepository(server, 'wasteOrganisationsService', (request) =>
      createApiWasteOrganisationsService(request.logger)
    )
  }
}
