/** @import { Collection, Db } from 'mongodb' */
/** @import { OrsImport, OrsImportsRepositoryFactory } from './port.js' */

const COLLECTION_NAME = 'ors-imports'

/**
 * @param {Db} db
 * @returns {Promise<Collection>}
 */
async function ensureCollection(db) {
  return db.collection(COLLECTION_NAME)
}

/**
 * @param {Db} db
 * @returns {Promise<OrsImportsRepositoryFactory>}
 */
export const createOrsImportsRepository = async (db) => {
  await ensureCollection(db)

  return () => ({
    async create(importDoc) {
      const now = new Date().toISOString()
      const doc = {
        ...importDoc,
        createdAt: now,
        updatedAt: now
      }
      await db.collection(COLLECTION_NAME).insertOne(doc)
      return doc
    },

    async findById(id) {
      return db.collection(COLLECTION_NAME).findOne({ _id: id })
    },

    async updateStatus(id, status) {
      await db
        .collection(COLLECTION_NAME)
        .updateOne(
          { _id: id },
          { $set: { status, updatedAt: new Date().toISOString() } }
        )
    },

    async recordFileResult(id, fileIndex, result) {
      await db.collection(COLLECTION_NAME).updateOne(
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
