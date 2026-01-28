import { ObjectId } from 'mongodb'

const COLLECTION_NAME = 'packaging-recycling-notes'

/**
 * Ensures the collection exists with required indexes.
 * Safe to call multiple times - MongoDB createIndex is idempotent.
 *
 * @param {import('mongodb').Db} db
 * @returns {Promise<import('mongodb').Collection>}
 */
async function ensureCollection(db) {
  const collection = db.collection(COLLECTION_NAME)

  // Optimises queries by issuing organisation and current status
  await collection.createIndex(
    {
      issuedByOrganisation: 1,
      'status.currentStatus': 1
    },
    { name: 'issuedBy_status' }
  )

  return collection
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} id
 * @returns {Promise<Object>} Prn
 */
const findById = async (db, id) => {
  return db
    .collection(COLLECTION_NAME)
    .findOne({ _id: ObjectId.createFromHexString(id) })
}

/**
 * @param {import('mongodb').Db} db
 * @returns {Promise<import('./port.js').PackagingRecyclingNotesRepositoryFactory>}
 */
export const createPackagingRecyclingNotesRepository = async (db) => {
  await ensureCollection(db)

  return () => ({
    findById: (id) => findById(db, id)
  })
}
