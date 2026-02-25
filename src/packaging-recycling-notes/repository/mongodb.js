import { ObjectId } from 'mongodb'

import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { PrnNumberConflictError } from './port.js'
import { validatePrnInsert, validatePrnRead } from './validation.js'

/** @import { Collection, Db, Document, Filter, WithId } from 'mongodb' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { PackagingRecyclingNote } from '#packaging-recycling-notes/domain/model.js' */
/** @import { FindByStatusParams, PackagingRecyclingNotesRepositoryFactory, PaginatedResult, UpdateStatusParams } from './port.js' */

const COLLECTION_NAME = 'packaging-recycling-notes'
const MONGODB_DUPLICATE_KEY_ERROR_CODE = 11000

/**
 * Ensures the prnNumber index exists with the unique constraint.
 * If an older non-unique index exists, drops it and recreates with unique: true.
 *
 * @param {Collection} collection
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
 * Ensures the organisation_status compound index uses the v2 field path.
 * Handles migration from v1 (organisationId) to v2 (organisation.id).
 *
 * @param {Collection} collection
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
 * @param {Collection} collection
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

/**
 * @param {Db} db
 * @returns {Promise<Collection>}
 */
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
 * @param {Db} db
 * @param {string} id
 * @returns {Promise<PackagingRecyclingNote | null>}
 */
const performFindById = async (db, id) => {
  const doc = await db
    .collection(COLLECTION_NAME)
    .findOne({ _id: ObjectId.createFromHexString(id) })

  if (!doc) {
    return null
  }

  return validatePrnRead({ ...doc, id: doc._id.toHexString() })
}

/**
 * @param {Db} db
 * @param {string} prnNumber
 * @returns {Promise<PackagingRecyclingNote | null>}
 */
const performFindByPrnNumber = async (db, prnNumber) => {
  const doc = await db.collection(COLLECTION_NAME).findOne({ prnNumber })

  if (!doc) {
    return null
  }

  return validatePrnRead({ ...doc, id: doc._id.toHexString() })
}

/**
 * @typedef {Omit<PackagingRecyclingNote, 'id'>} CreatePrnInput
 */

/**
 * @param {Db} db
 * @param {CreatePrnInput} prn
 * @returns {Promise<PackagingRecyclingNote>}
 */
const performCreate = async (db, prn) => {
  const validated = validatePrnInsert(prn)
  const result = await db.collection(COLLECTION_NAME).insertOne(validated)

  return {
    ...validated,
    id: result.insertedId.toHexString()
  }
}

/**
 * @param {Db} db
 * @param {string} accreditationId
 * @returns {Promise<PackagingRecyclingNote[]>}
 */
const performFindByAccreditation = async (db, accreditationId) => {
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
 * @param {Organisation['id'][]} excludeOrganisationIds
 * @returns {(params: Omit<FindByStatusParams, 'limit'>) => Filter<Document>}
 */
const buildFindByStatusFilter =
  (excludeOrganisationIds) =>
  ({ cursor, dateFrom, dateTo, statuses }) => {
    /** @type {Filter<Document>} */
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

    if (excludeOrganisationIds.length) {
      filter['organisation.id'] = { $nin: excludeOrganisationIds }
    }

    return filter
  }

/**
 * @param {Db} db
 * @param {Organisation['id'][]} excludeOrganisationIds
 * @returns {(params: FindByStatusParams) => Promise<PaginatedResult>}
 */
const performFindByStatus = (db, excludeOrganisationIds) => {
  const buildFilter = buildFindByStatusFilter(excludeOrganisationIds)

  return async (params) => {
    const docs = await db
      .collection(COLLECTION_NAME)
      .find(buildFilter(params))
      .sort({ _id: 1 })
      .limit(params.limit + 1)
      .toArray()

    const hasMore = docs.length > params.limit
    const items = hasMore ? docs.slice(0, params.limit) : docs

    return {
      items: items.map((doc) =>
        validatePrnRead({ ...doc, id: doc._id.toHexString() })
      ),
      nextCursor: hasMore
        ? /** @type {WithId<Document>} */ (items.at(-1))._id.toHexString()
        : null,
      hasMore
    }
  }
}

/**
 * @param {Db} db
 * @param {UpdateStatusParams} params
 * @returns {Promise<PackagingRecyclingNote | null>}
 */
const performUpdateStatus = async (
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
 * @param {Db} db
 * @param {Organisation['id'][]} [excludeOrganisationIds]
 * @returns {Promise<PackagingRecyclingNotesRepositoryFactory>}
 */
export const createPackagingRecyclingNotesRepository = async (
  db,
  excludeOrganisationIds = []
) => {
  await ensureCollection(db)

  return () => ({
    create: (prn) => performCreate(db, prn),
    findByAccreditation: (accreditationId) =>
      performFindByAccreditation(db, accreditationId),
    findById: (id) => performFindById(db, id),
    findByPrnNumber: (prnNumber) => performFindByPrnNumber(db, prnNumber),
    findByStatus: performFindByStatus(db, excludeOrganisationIds),
    updateStatus: (params) => performUpdateStatus(db, params)
  })
}
