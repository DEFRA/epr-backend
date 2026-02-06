/** @import {SystemLog} from './port.js' */

/**
 * @param {import('#common/helpers/logging/logger.js').TypedLogger} _logger - unused, for interface consistency
 * @returns {import('./port.js').SystemLogsRepository}
 */
export function createSystemLogsRepository(_logger) {
  /** @type SystemLog[] */
  const storage = []

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
