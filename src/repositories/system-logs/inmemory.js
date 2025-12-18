/** @import {SystemLog} from './port.js' */

/**
 * @returns {import('./port.js').SystemLogsRepositoryFactory}
 */
export function createSystemLogsRepository() {
  /** @type SystemLog[] */
  const storage = []
  return () => {
    return {
      async insert(systemLog) {
        storage.push(systemLog)
      },

      async findByOrganisationId(organisationId) {
        const results = storage.filter(
          (payload) => payload.context?.organisationId === organisationId
        )
        // coerce dates to numbers then subtract
        // b - a to produce most recent first
        results.sort((a, b) => +b.createdAt - +a.createdAt)
        return results
      }
    }
  }
}
