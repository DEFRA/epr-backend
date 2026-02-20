import { createInMemoryWasteOrganisationsService } from './inmemory-adapter.js'
import { registerRepository } from '#plugins/register-repository.js'

/**
 * @param {Array<{ id: string; name: string; tradingName?: string | null; registrationType?: string }>} [organisations]
 * @returns {import('@hapi/hapi').Plugin<void>}
 */
export function createInMemoryWasteOrganisationsPlugin(organisations) {
  const service = createInMemoryWasteOrganisationsService(organisations)

  return {
    name: 'wasteOrganisationsService',
    register: (server) => {
      registerRepository(server, 'wasteOrganisationsService', () => service)
    }
  }
}
