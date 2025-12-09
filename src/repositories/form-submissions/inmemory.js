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
    async findAccreditationsBySystemReference(ref) {
      return structuredClone(accreditations).filter(
        (acc) => acc.referenceNumber.toLowerCase() === ref.toLowerCase()
      )
    },
    async findAccreditationById(id) {
      if (!id || (id.trim && !id.trim())) {
        return null
      }
      return (
        structuredClone(accreditations).find((org) => org.id === id) || null
      )
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
    },
    async findRegistrationsBySystemReference(ref) {
      return structuredClone(registrations).filter(
        (reg) => reg.referenceNumber.toLowerCase() === ref.toLowerCase()
      )
    },
    async findRegistrationById(id) {
      if (!id || (id.trim && !id.trim())) {
        return null
      }
      return structuredClone(registrations).find((org) => org.id === id) || null
    },
    async findAllFormSubmissionIds() {
      return {
        organisations: new Set(organisations.map((org) => org.id)),
        registrations: new Set(registrations.map((reg) => reg.id)),
        accreditations: new Set(accreditations.map((acc) => acc.id))
      }
    }
  })
}
