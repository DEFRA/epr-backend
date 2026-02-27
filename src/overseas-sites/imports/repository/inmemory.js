import { registerRepository } from '#plugins/register-repository.js'

/** @import { OrsImport, OrsImportsRepositoryFactory } from './port.js' */

/** @typedef {Map<string, OrsImport>} Storage */

/**
 * @returns {OrsImportsRepositoryFactory}
 */
export function createInMemoryOrsImportsRepository() {
  /** @type {Storage} */
  const storage = new Map()

  return () => ({
    async create(importDoc) {
      const now = new Date().toISOString()
      const doc = {
        ...structuredClone(importDoc),
        createdAt: now,
        updatedAt: now
      }
      storage.set(doc._id, doc)
      return structuredClone(doc)
    },

    async findById(id) {
      const doc = storage.get(id)
      return doc ? structuredClone(doc) : null
    },

    async updateStatus(id, status) {
      const doc = storage.get(id)
      if (doc) {
        doc.status = status
        doc.updatedAt = new Date().toISOString()
      }
    },

    async recordFileResult(id, fileIndex, result) {
      const doc = storage.get(id)
      if (doc && doc.files[fileIndex]) {
        doc.files[fileIndex].result = structuredClone(result)
        doc.updatedAt = new Date().toISOString()
      }
    }
  })
}

export function createInMemoryOrsImportsRepositoryPlugin() {
  const factory = createInMemoryOrsImportsRepository()
  const repository = factory()

  return {
    name: 'orsImportsRepository',
    register: (server) => {
      registerRepository(server, 'orsImportsRepository', () => repository)
    }
  }
}
