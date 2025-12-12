/**
 * @returns {import('./port.js').SystemLogsRepositoryFactory}
 */
export function createSystemLogsRepository() {
  return () => {
    const storage = []
    return {
      async insert(systemLog) {
        storage.push(systemLog)
      },

      async findByOrganisationId(organisationId) {
        return storage.filter(
          (payload) => payload.context?.organisationId === organisationId
        )
      }
    }
  }
}
