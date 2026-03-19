/** @import { Db } from 'mongodb' */
/** @import { OrsImport, OrsImportsRepositoryFactory } from './port.js' */

import { calculateOrsImportExpiresAt } from '../../domain/import-status.js'

const COLLECTION_NAME = 'ors-imports'

/**
 * @param {Db} db
 * @returns {Promise<OrsImportsRepositoryFactory>}
 */
export const createOrsImportsRepository = async (db) => {
  /** @type {import('mongodb').Collection<OrsImport>} */
  const collection = db.collection(COLLECTION_NAME)

  await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })

  return () => ({
    async create(importDoc) {
      const now = new Date().toISOString()
      const expiresAt = calculateOrsImportExpiresAt(importDoc.status)
      const doc = {
        ...importDoc,
        createdAt: now,
        updatedAt: now,
        expiresAt
      }
      await collection.insertOne(doc)
      return doc
    },

    async findById(id) {
      return collection.findOne({ _id: id })
    },

    async addFiles(id, files) {
      await collection.updateOne(
        { _id: id },
        {
          $push: { files: { $each: files } },
          $set: { updatedAt: new Date().toISOString() }
        }
      )
    },

    async updateStatus(id, status) {
      const expiresAt = calculateOrsImportExpiresAt(status)
      await collection.updateOne(
        { _id: id },
        {
          $set: {
            status,
            updatedAt: new Date().toISOString(),
            expiresAt
          }
        }
      )
    },

    async recordFileResult(id, fileIndex, result) {
      await collection.updateOne(
        { _id: id },
        {
          $set: {
            [`files.${fileIndex}.result`]: result,
            updatedAt: new Date().toISOString()
          }
        }
      )
    }
  })
}
