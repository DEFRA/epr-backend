/**
 * @param {Object[]} [initialAccreditations=[]]
 * @param {Object[]} [initialRegistrations=[]]
 * @returns {import('./port.js').FormSubmissionsRepositoryFactory}
 */
export const createFormSubmissionsRepository = (
  initialAccreditations = [],
  initialRegistrations = []
) => {
  const accreditations = structuredClone(initialAccreditations)
  const registrations = structuredClone(initialRegistrations)

  return () => ({
    async findAllAccreditations() {
      return structuredClone(accreditations)
    },

    async findAllRegistrations() {
      return structuredClone(registrations)
    }
  })
}
