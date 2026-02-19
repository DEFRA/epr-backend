import Boom from '@hapi/boom'

/** @import {WasteOrganisationsService} from './api-adapter.js' */

/**
 * Creates an in-memory waste organisations service for testing.
 * @param {Array<{ id: string; name: string; tradingName?: string | null; registrationType?: string }>} [organisations]
 * @returns {WasteOrganisationsService}
 */
export function createInMemoryWasteOrganisationsService(organisations = []) {
  return {
    async getOrganisationById(id) {
      const organisation = organisations.find((o) => o.id === id)

      if (!organisation) {
        throw Boom.notFound(
          `Organisation ${id} not found in waste organisations API`
        )
      }

      return organisation
    }
  }
}
