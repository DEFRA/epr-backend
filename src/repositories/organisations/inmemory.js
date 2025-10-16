/**
 * @typedef {{ _id: string, [key: string]: any }} Organisation
 */

/**
 * Create an in-memory organisations repository.
 * Ensures data isolation by deep-cloning on store and on read.
 *
 * @param {Organisation[]} [initialOrganisations=[]]
 * @returns {import('./port.js').OrganisationsRepository}
 */
export const createInMemoryOrganisationsRepository = (
  initialOrganisations = []
) => {
  // Store a deep-cloned snapshot of initial data to avoid external mutation.
  const storage = structuredClone(initialOrganisations)

  return {
    async findAll() {
      // Return a deep clone to prevent consumers mutating internal state.
      return structuredClone(storage)
    }
  }
}
