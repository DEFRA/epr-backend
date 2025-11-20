/**
 * @param {Object[]} [initialAccreditations=[]]
 * @param {Object[]} [initialRegistrations=[]]
 * @param {Object[]} [initialOrganisations=[]]
 * @returns {import('./port.js').FormSubmissionsRepositoryFactory}
 */
export const createFormSubmissionsRepository = (
  initialAccreditations = [],
  initialRegistrations = [],
  initialOrganisations = []
) => {
  const organisations = structuredClone(initialOrganisations)
  const accreditations = structuredClone(initialAccreditations)
  const registrations = structuredClone(initialRegistrations)

  return () => ({
    async findAllAccreditations() {
      return structuredClone(accreditations)
    },
    async findAllOrganisations() {
      return structuredClone(organisations)
    },
    async findOrganisationById(id) {
      if (!id || (id.trim && !id.trim())) {
        return null
      }
      return structuredClone(organisations).find((org) => org.id === id) || null
    },
    async findAllRegistrations() {
      return structuredClone(registrations)
    }
  })
}
