import { ObjectId } from 'mongodb'

import { validateId } from './validation.js'

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

  // Optimises queries for PRN list by accreditation
  await collection.createIndex(
    { accreditationId: 1 },
    { name: 'accreditationId' }
  )

  return collection
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} id
 * @returns {Promise<Object|null>} Prn
 */
const findById = async (db, id) => {
  const validatedId = validateId(id)
  return db
    .collection(COLLECTION_NAME)
    .findOne({ _id: ObjectId.createFromHexString(validatedId) })
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} accreditationId
 * @returns {Promise<Array<Object>>} PRNs for the accreditation
 */
const findByAccreditationId = async (db, accreditationId) => {
  const validatedAccreditationId = validateId(accreditationId)
  return db
    .collection(COLLECTION_NAME)
    .find({ accreditationId: validatedAccreditationId })
    .toArray()
}

/**
 * @param {import('mongodb').Db} db
 * @returns {Promise<import('./port.js').PackagingRecyclingNotesRepositoryFactory>}
 */
export const createPackagingRecyclingNotesRepository = async (db) => {
  await ensureCollection(db)

  return () => ({
    findById: (id) => findById(db, id),
    findByAccreditationId: (accreditationId) =>
      findByAccreditationId(db, accreditationId)
  })
}
