import Boom from '@hapi/boom'

import { validateId } from './validation.js'

/**
 * In-memory implementation of the packaging recycling notes repository.
 * Used for unit testing and contract tests.
 *
 * @param {Array} initialData - Optional initial PRN data
 * @returns {import('./port.js').PackagingRecyclingNotesRepositoryFactory}
 */
export const createInMemoryPackagingRecyclingNotesRepository = (
  initialData = []
) => {
  const storage = new Map()

  // Populate with initial data
  for (const prn of initialData) {
    const id = prn._id?.toString() ?? prn.id
    storage.set(id, structuredClone(prn))
  }

  return () => ({
    /**
     * @param {string} id
     * @param {Object} prn
     * @returns {Promise<void>}
     */
    insert: async (id, prn) => {
      const validatedId = validateId(id)

      if (storage.has(validatedId)) {
        throw Boom.conflict(`PRN with id ${validatedId} already exists`)
      }

      storage.set(validatedId, structuredClone(prn))
    },

    /**
     * @param {string} id
     * @returns {Promise<Object|null>}
     */
    findById: async (id) => {
      const validatedId = validateId(id)
      const prn = storage.get(validatedId)
      return prn ? structuredClone(prn) : null
    },

    /**
     * @param {string} accreditationId
     * @returns {Promise<Array<Object>>}
     */
    findByAccreditationId: async (accreditationId) => {
      const validatedAccreditationId = validateId(accreditationId)
      const results = []
      for (const prn of storage.values()) {
        if (prn.accreditationId === validatedAccreditationId) {
          results.push(structuredClone(prn))
        }
      }
      return results
    }
  })
}
