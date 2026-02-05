import { ObjectId } from 'mongodb'
import { registerRepository } from '#plugins/register-repository.js'

/**
 * In-memory implementation of the lumpy packaging recycling notes repository.
 * Used for unit testing.
 *
 * @param {Array} [initialData] - Optional initial PRN data
 * @returns {() => import('./port.js').PackagingRecyclingNotesRepository}
 */
function createInMemoryLumpyPackagingRecyclingNotesRepository(
  initialData = []
) {
  const storage = new Map()

  // Populate with initial data
  for (const prn of initialData) {
    const id = prn._id?.toString() ?? prn.id
    storage.set(id, structuredClone({ ...prn, id }))
  }

  return () => ({
    /**
     * @param {string} id
     * @returns {Promise<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>}
     */
    findById: async (id) => {
      const prn = storage.get(id)
      return prn ? structuredClone(prn) : null
    },

    /**
     * @param {Omit<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote, 'id'>} prn
     * @returns {Promise<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>}
     */
    create: async (prn) => {
      const id = new ObjectId().toHexString()
      const prnWithId = { ...prn, id }
      storage.set(id, structuredClone(prnWithId))
      return structuredClone(prnWithId)
    },

    /**
     * @param {string} accreditationId
     * @returns {Promise<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote[]>}
     */
    findByAccreditation: async (accreditationId) => {
      const results = []
      for (const prn of storage.values()) {
        if (
          prn.issuedByAccreditation === accreditationId &&
          prn.status?.currentStatus !== 'deleted'
        ) {
          results.push(structuredClone(prn))
        }
      }
      return results
    },

    /**
     * @param {import('./port.js').UpdateStatusParams} params
     * @returns {Promise<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>}
     */
    updateStatus: async ({ id, status, updatedBy, updatedAt }) => {
      const prn = storage.get(id)
      if (!prn) {
        return null
      }
      const updated = {
        ...prn,
        status,
        updatedBy,
        updatedAt
      }
      storage.set(id, updated)
      return structuredClone(updated)
    }
  })
}

/**
 * Creates an in-memory lumpy packaging recycling notes repository plugin.
 *
 * @param {Object[]} [initialPrns] - Optional initial PRN data
 * @returns {import('@hapi/hapi').Plugin<void>}
 */
export function createInMemoryLumpyPackagingRecyclingNotesRepositoryPlugin(
  initialPrns
) {
  const factory =
    createInMemoryLumpyPackagingRecyclingNotesRepository(initialPrns)
  const repository = factory()

  return {
    name: 'lumpyPackagingRecyclingNotesRepository',
    register: (server) => {
      registerRepository(
        server,
        'lumpyPackagingRecyclingNotesRepository',
        () => repository
      )
    }
  }
}
