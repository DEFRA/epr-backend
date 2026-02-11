import { ObjectId } from 'mongodb'

import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { PrnNumberConflictError } from './port.js'
import { validatePrnInsert, validatePrnRead } from './validation.js'

const COLLECTION_NAME = 'packaging-recycling-notes'
const MONGODB_DUPLICATE_KEY_ERROR_CODE = 11000

/**
 * Ensures the prnNumber index exists with the unique constraint.
 * If an older non-unique index exists, drops it and recreates with unique: true.
 *
 * @param {import('mongodb').Collection} collection
 */
async function ensurePrnNumberIndex(collection) {
  const indexName = 'prnNumber'

  try {
    const indexes = await collection.indexes()
    const existingIndex = indexes.find((idx) => idx.name === indexName)

    if (existingIndex && !existingIndex.unique) {
      await collection.dropIndex(indexName)
    }
  } catch (error) {
    // NamespaceNotFound means the collection doesn't exist yet.
    // This is fine - createIndex below will create the collection.
    if (error.codeName !== 'NamespaceNotFound') {
      throw error
    }
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
/**
 * Ensures the organisation_status compound index uses the v2 field path.
 * Handles migration from v1 (organisationId) to v2 (organisation.id).
 *
 * @param {import('mongodb').Collection} collection
 */
async function ensureOrganisationStatusIndex(collection) {
  const indexName = 'organisationId_status'

  try {
    const indexes = await collection.indexes()
    const existingIndex = indexes.find((idx) => idx.name === indexName)

    if (existingIndex?.key?.organisationId) {
      await collection.dropIndex(indexName)
    }
  } catch (error) {
    if (error.codeName !== 'NamespaceNotFound') {
      throw error
    }
  }

  await collection.createIndex(
    { 'organisation.id': 1, 'status.currentStatus': 1 },
    { name: indexName }
  )
}

/**
 * Ensures the status_currentStatusAt compound index exists.
 * Covers findByStatus queries: status + date range + cursor pagination.
 *
 * @param {import('mongodb').Collection} collection
 */
async function ensureStatusDateIndex(collection) {
  try {
    await collection.createIndex(
      { 'status.currentStatus': 1, 'status.currentStatusAt': 1, _id: 1 },
      { name: 'status_currentStatusAt' }
    )
  } catch (error) {
    if (error.codeName !== 'NamespaceNotFound') {
      throw error
    }
  }
}

async function ensureCollection(db) {
  const collection = db.collection(COLLECTION_NAME)

  await ensureOrganisationStatusIndex(collection)

  // Unique index for PRN numbers - sparse to allow null values
  // Uses helper to handle migration from older non-unique index
  await ensurePrnNumberIndex(collection)

  await ensureStatusDateIndex(collection)

  return collection
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} id
 * @returns {Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>}
 */
const findById = async (db, id) => {
  const doc = await db
    .collection(COLLECTION_NAME)
    .findOne({ _id: ObjectId.createFromHexString(id) })

  if (!doc) {
    return null
  }

  return validatePrnRead({ ...doc, id: doc._id.toHexString() })
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} prnNumber
 * @returns {Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>}
 */
const findByPrnNumber = async (db, prnNumber) => {
  const doc = await db.collection(COLLECTION_NAME).findOne({ prnNumber })

  if (!doc) {
    return null
  }

  return validatePrnRead({ ...doc, id: doc._id.toHexString() })
}

/**
 * @typedef {Omit<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote, 'id'>} CreatePrnInput
 */

/**
 * @param {import('mongodb').Db} db
 * @param {CreatePrnInput} prn
 * @returns {Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>}
 */
const create = async (db, prn) => {
  const validated = validatePrnInsert(prn)
  const result = await db.collection(COLLECTION_NAME).insertOne(validated)

  return {
    ...validated,
    id: result.insertedId.toHexString()
  }
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} accreditationId
 * @returns {Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote[]>}
 */
const findByAccreditation = async (db, accreditationId) => {
  const docs = await db
    .collection(COLLECTION_NAME)
    .find({
      'accreditation.id': accreditationId,
      'status.currentStatus': { $ne: PRN_STATUS.DELETED }
    })
    .toArray()

  return docs.map((doc) =>
    validatePrnRead({ ...doc, id: doc._id.toHexString() })
  )
}

/**
 * @param {import('./port.js').FindByStatusParams} params
 * @returns {import('mongodb').Filter<import('mongodb').Document>}
 */
function buildFindByStatusFilter({ statuses, dateFrom, dateTo, cursor }) {
  /** @type {import('mongodb').Filter<import('mongodb').Document>} */
  const filter = {}

  if (cursor) {
    filter._id = { $gt: ObjectId.createFromHexString(cursor) }
  }

  filter['status.currentStatus'] = { $in: statuses }

  if (dateFrom || dateTo) {
    /** @type {Record<string, Date>} */
    const dateCondition = {}
    if (dateFrom) {
      dateCondition.$gte = dateFrom
    }
    if (dateTo) {
      dateCondition.$lte = dateTo
    }
    filter['status.currentStatusAt'] = dateCondition
  }

  return filter
}

/**
 * @param {import('mongodb').Db} db
 * @param {import('./port.js').FindByStatusParams} params
 * @returns {Promise<import('./port.js').PaginatedResult>}
 */
const findByStatus = async (db, params) => {
  const filter = buildFindByStatusFilter(params)

  const docs = await db
    .collection(COLLECTION_NAME)
    .find(filter)
    .sort({ _id: 1 })
    .limit(params.limit + 1)
    .toArray()

  const hasMore = docs.length > params.limit
  const items = hasMore ? docs.slice(0, params.limit) : docs

  return {
    items: items.map((doc) =>
      validatePrnRead({ ...doc, id: doc._id.toHexString() })
    ),
    nextCursor: hasMore ? items.at(-1)._id.toHexString() : null,
    hasMore
  }
}

/**
 * @param {import('mongodb').Db} db
 * @param {import('./port.js').UpdateStatusParams} params
 * @returns {Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote | null>}
 */
const updateStatus = async (
  db,
  { id, status, updatedBy, updatedAt, prnNumber, operation }
) => {
  const setFields = {
    'status.currentStatus': status,
    'status.currentStatusAt': updatedAt,
    updatedAt,
    updatedBy
  }

  if (prnNumber) {
    setFields.prnNumber = prnNumber
  }

  if (operation) {
    setFields[`status.${operation.slot}`] = {
      at: operation.at,
      by: operation.by
    }
  }

  try {
    const result = await db.collection(COLLECTION_NAME).findOneAndUpdate(
      { _id: ObjectId.createFromHexString(id) },
      {
        $set: setFields,
        $push: /** @type {*} */ ({
          'status.history': { status, at: updatedAt, by: updatedBy }
        })
      },
      { returnDocument: 'after' }
    )

    if (!result) {
      return null
    }

    return validatePrnRead({ ...result, id: result._id.toHexString() })
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
    findByPrnNumber: (prnNumber) => findByPrnNumber(db, prnNumber),
    create: (prn) => create(db, prn),
    findByAccreditation: (accreditationId) =>
      findByAccreditation(db, accreditationId),
    findByStatus: (params) => findByStatus(db, params),
    updateStatus: (params) => updateStatus(db, params)
  })
}
