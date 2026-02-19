/** @import {WasteOrganisationsService} from './api-adapter.js' */

/**
 * Creates an in-memory waste organisations service for testing.
 * @param {Array<{ id: string; name: string; tradingName?: string | null; registrationType?: string }>} [organisations]
 * @returns {WasteOrganisationsService}
 */
export function createInMemoryWasteOrganisationsService(organisations = []) {
  return {
    async getOrganisationById(id) {
      return organisations.find((o) => o.id === id) ?? null
    }
  }
}
