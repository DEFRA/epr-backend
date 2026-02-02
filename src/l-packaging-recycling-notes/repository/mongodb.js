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

  // Index for PRN number lookups
  await collection.createIndex(
    { prnNumber: 1 },
    { name: 'prnNumber', sparse: true }
  )

  return collection
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} id
 * @returns {Promise<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>}
 */
const findById = async (db, id) => {
  const doc = await db
    .collection(COLLECTION_NAME)
    .findOne({ _id: ObjectId.createFromHexString(id) })

  if (!doc) {
    return null
  }

  return {
    ...doc,
    id: doc._id.toHexString()
  }
}

/**
 * @typedef {Omit<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote, 'id'>} CreatePrnInput
 */

/**
 * @param {import('mongodb').Db} db
 * @param {CreatePrnInput} prn
 * @returns {Promise<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>}
 */
const create = async (db, prn) => {
  const result = await db.collection(COLLECTION_NAME).insertOne(prn)

  return {
    ...prn,
    id: result.insertedId.toHexString()
  }
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} registrationId
 * @returns {Promise<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote[]>}
 */
const findByRegistration = async (db, registrationId) => {
  const docs = await db
    .collection(COLLECTION_NAME)
    .find({ issuedByRegistration: registrationId })
    .toArray()

  return docs.map((doc) => ({
    ...doc,
    id: doc._id.toHexString()
  }))
}

/**
 * @param {import('mongodb').Db} db
 * @param {import('./port.js').UpdateStatusParams} params
 * @returns {Promise<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>}
 */
const updateStatus = async (db, { id, status, updatedBy, updatedAt }) => {
  const result = await db.collection(COLLECTION_NAME).findOneAndUpdate(
    { _id: ObjectId.createFromHexString(id) },
    {
      $set: {
        'status.currentStatus': status,
        updatedAt
      },
      $push: {
        'status.history': { status, updatedAt, updatedBy }
      }
    },
    { returnDocument: 'after' }
  )

  if (!result) {
    return null
  }

  return {
    ...result,
    id: result._id.toHexString()
  }
}

/**
 * @param {import('mongodb').Db} db
 * @returns {Promise<import('./port.js').PackagingRecyclingNotesRepositoryFactory>}
 */
export const createPackagingRecyclingNotesRepository = async (db) => {
  await ensureCollection(db)

  return () => ({
    findById: (id) => findById(db, id),
    create: (prn) => create(db, prn),
    findByRegistration: (registrationId) =>
      findByRegistration(db, registrationId),
    updateStatus: (params) => updateStatus(db, params)
  })
}
