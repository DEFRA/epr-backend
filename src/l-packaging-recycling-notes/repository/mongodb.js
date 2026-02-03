import { ObjectId } from 'mongodb'

const COLLECTION_NAME = 'l-packaging-recycling-notes'
const MONGODB_DUPLICATE_KEY_ERROR_CODE = 11000

/**
 * Error thrown when a PRN number already exists in the database.
 * Callers can catch this to retry with a different PRN number.
 */
export class PrnNumberConflictError extends Error {
  constructor(prnNumber) {
    super(`PRN number already exists: ${prnNumber}`)
    this.name = 'PrnNumberConflictError'
    this.prnNumber = prnNumber
  }
}

/**
 * Ensures the prnNumber index exists with the unique constraint.
 * If an older non-unique index exists, drops it and recreates with unique: true.
 *
 * @param {import('mongodb').Collection} collection
 */
async function ensurePrnNumberIndex(collection) {
  const indexName = 'prnNumber'
  const indexes = await collection.indexes()
  const existingIndex = indexes.find((idx) => idx.name === indexName)

  if (existingIndex && !existingIndex.unique) {
    await collection.dropIndex(indexName)
  }

  await collection.createIndex(
    { prnNumber: 1 },
    { name: indexName, sparse: true, unique: true }
  )
}

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

  // Unique index for PRN numbers - sparse to allow null values
  // Uses helper to handle migration from older non-unique index
  await ensurePrnNumberIndex(collection)

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

  return /** @type {import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} */ (
    /** @type {unknown} */ ({
      ...doc,
      id: doc._id.toHexString()
    })
  )
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
 * @param {string} accreditationId
 * @returns {Promise<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote[]>}
 */
const findByAccreditation = async (db, accreditationId) => {
  const docs = await db
    .collection(COLLECTION_NAME)
    .find({ issuedByAccreditation: accreditationId })
    .toArray()

  return /** @type {import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote[]} */ (
    /** @type {unknown} */ (
      docs.map((doc) => ({
        ...doc,
        id: doc._id.toHexString()
      }))
    )
  )
}

/**
 * @param {import('mongodb').Db} db
 * @param {import('./port.js').UpdateStatusParams} params
 * @returns {Promise<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>}
 */
const updateStatus = async (
  db,
  { id, status, updatedBy, updatedAt, prnNumber }
) => {
  const setFields = {
    'status.currentStatus': status,
    updatedAt
  }

  if (prnNumber) {
    setFields.prnNumber = prnNumber
  }

  try {
    const result = await db.collection(COLLECTION_NAME).findOneAndUpdate(
      { _id: ObjectId.createFromHexString(id) },
      {
        $set: setFields,
        $push: /** @type {*} */ ({
          'status.history': { status, updatedAt, updatedBy }
        })
      },
      { returnDocument: 'after' }
    )

    if (!result) {
      return null
    }

    return /** @type {import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} */ (
      /** @type {unknown} */ ({
        ...result,
        id: result._id.toHexString()
      })
    )
  } catch (error) {
    if (
      error.code === MONGODB_DUPLICATE_KEY_ERROR_CODE &&
      error.keyPattern?.prnNumber
    ) {
      throw new PrnNumberConflictError(prnNumber)
    }
    throw error
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
    findByAccreditation: (accreditationId) =>
      findByAccreditation(db, accreditationId),
    updateStatus: (params) => updateStatus(db, params)
  })
}
