/**
 * @typedef {{ id: string, [key: string]: any }} Organisation
 */

/**
 * Create an in-memory organisations repository.
 * Ensures data isolation by deep-cloning on store and on read.
 *
 * @param {Organisation[]} [initialOrganisations=[]]
 * @returns {import('./port.js').OrganisationsRepositoryFactory}
 */
export const createInMemoryOrganisationsRepository = (
  initialOrganisations = []
) => {
  // Store a deep-cloned snapshot of initial data to avoid external mutation.
  const storage = structuredClone(initialOrganisations)

  return () => ({
    async findAll() {
      return structuredClone(storage)
    },
    async findById(id) {
      const found = storage.find((o) => o.id === id)
      return found ? structuredClone(found) : null
    }
  })
}
