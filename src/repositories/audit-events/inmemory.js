/**
 * @returns {import('./port.js').AuditEventsRepositoryFactory}
 */
export function createAuditEventsRepository() {
  return () => {
    const storage = []
    return {
      async insert(auditingPayload) {
        storage.push({
          createdAt: new Date(),
          ...auditingPayload
        })
      },

      async findByOrganisationId(organisationId) {
        return storage.filter(
          (payload) => payload.context?.organisationId === organisationId
        )
      }
    }
  }
}
