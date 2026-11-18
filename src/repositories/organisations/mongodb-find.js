import Boom from '@hapi/boom'

import { buildFindFilter } from './find-filter.js'
import { mapDocumentWithCurrentStatuses } from './helpers.js'

/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { Db, Document, Filter } from 'mongodb' */
/** @import { FindParams } from './administration-port.js' */

/**
 * How the organisations repository reads organisations from MongoDB.
 */

export const COLLECTION_NAME = 'epr-organisations'

// Production-safe defaults for multi-AZ MongoDB w:majority (typical p99 lag: 100-200ms)
export const DEFAULT_MAX_CONSISTENCY_RETRIES = 20
export const DEFAULT_CONSISTENCY_RETRY_DELAY_MS = 25

/**
 * Reads the organisation document matching `filter` once.
 *
 * @param {Db} db
 * @param {Filter<Document>} filter
 * @returns {Promise<Organisation | null>}
 */
export const findOne = async (db, filter) => {
  const doc = await db.collection(COLLECTION_NAME).findOne(filter)
  return doc ? mapDocumentWithCurrentStatuses(doc) : null
}

/**
 * Reads the one organisation `filter` matches, retrying until its version is
 * at least `minimumVersion`. Without `minimumVersion` it reads once. Resolves
 * null when no organisation matches, and throws 500 when the version never
 * arrives.
 *
 * @param {Db} db
 * @param {number} maxRetries
 * @param {number} retryDelayMs
 * @param {Filter<Document>} filter
 * @param {number} [minimumVersion]
 * @returns {Promise<Organisation | null>}
 */
export const findOneAtMinimumVersion = async (
  db,
  maxRetries,
  retryDelayMs,
  filter,
  minimumVersion
) => {
  if (minimumVersion === undefined) {
    return findOne(db, filter)
  }

  for (let i = 0; i < maxRetries; i++) {
    const doc = await db.collection(COLLECTION_NAME).findOne(filter)

    const isLastRetry = i === maxRetries - 1

    if (doc) {
      if (doc.version >= minimumVersion) {
        return mapDocumentWithCurrentStatuses(doc)
      }
      // Document exists but version too low - will retry
    } else if (isLastRetry) {
      return null
    } else {
      // Document not found but have retries left - will retry
    }

    if (!isLastRetry) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs)) // NOSONAR: javascript:S9382 - each retry must wait for the one before it
    }
  }

  throw Boom.internal('Consistency timeout waiting for minimum version')
}

/**
 * The stored organisations matching every criterion, sorted by name, a page
 * at a time.
 *
 * @param {Db} db
 * @param {FindParams} params
 * @returns {Promise<{ items: Organisation[], page: number, pageSize: number, totalItems: number, totalPages: number }>}
 */
export const findPage = async (db, { page, pageSize, ...criteria }) => {
  const filter = buildFindFilter(criteria)

  const collection = db.collection(COLLECTION_NAME)
  const totalItems = await collection.countDocuments(filter)
  const docs = await collection
    .find(filter)
    .sort({ 'companyDetails.name': 1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .toArray()

  const items = docs.map((doc) => mapDocumentWithCurrentStatuses(doc))
  const totalPages = Math.ceil(totalItems / pageSize)

  return { items, page, pageSize, totalItems, totalPages }
}

/**
 * Every stored organisation.
 *
 * @param {Db} db
 * @returns {Promise<Organisation[]>}
 */
export const findAll = async (db) => {
  const docs = await db.collection(COLLECTION_NAME).find().toArray()
  return docs.map((doc) => mapDocumentWithCurrentStatuses(doc))
}
