import { ObjectId } from 'mongodb'

import {
  validateOverseasSiteInsert,
  validateOverseasSiteRead
} from './validation.js'

/** @import { Collection, Db } from 'mongodb' */
/** @import { FindAllParams, OverseasSite, OverseasSitesRepositoryFactory } from './port.js' */

const COLLECTION_NAME = 'overseas-sites'

/**
 * Ensures the name_country compound index exists for search queries.
 *
 * @param {Collection} collection
 */
async function ensureNameCountryIndex(collection) {
  try {
    await collection.createIndex(
      { name: 1, country: 1 },
      { name: 'name_country' }
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

  await ensureNameCountryIndex(collection)

  return collection
}

/**
 * @param {Db} db
 * @param {string} id
 * @returns {Promise<OverseasSite | null>}
 */
const performFindById = async (db, id) => {
  const doc = await db
    .collection(COLLECTION_NAME)
    .findOne({ _id: ObjectId.createFromHexString(id) })

  if (!doc) {
    return null
  }

  return validateOverseasSiteRead({ ...doc, id: doc._id.toHexString() })
}

/**
 * @param {Db} db
 * @param {Omit<OverseasSite, 'id'>} site
 * @returns {Promise<OverseasSite>}
 */
const performCreate = async (db, site) => {
  const validated = validateOverseasSiteInsert(site)
  const result = await db.collection(COLLECTION_NAME).insertOne(validated)

  return {
    ...validated,
    id: result.insertedId.toHexString()
  }
}

/**
 * @param {Db} db
 * @param {string} id
 * @param {Partial<Omit<OverseasSite, 'id' | 'createdAt'>>} updates
 * @returns {Promise<OverseasSite | null>}
 */
const performUpdate = async (db, id, updates) => {
  const result = await db
    .collection(COLLECTION_NAME)
    .findOneAndUpdate(
      { _id: ObjectId.createFromHexString(id) },
      { $set: updates },
      { returnDocument: 'after' }
    )

  if (!result) {
    return null
  }

  return validateOverseasSiteRead({ ...result, id: result._id.toHexString() })
}

/**
 * @param {Db} db
 * @param {string} id
 * @returns {Promise<boolean>}
 */
const performRemove = async (db, id) => {
  const result = await db
    .collection(COLLECTION_NAME)
    .deleteOne({ _id: ObjectId.createFromHexString(id) })

  return result.deletedCount > 0
}

/**
 * @param {Db} db
 * @param {FindAllParams} [params]
 * @returns {Promise<OverseasSite[]>}
 */
const performFindAll = async (db, params) => {
  /** @type {import('mongodb').Filter<import('mongodb').Document>} */
  const filter = {}

  if (params?.country) {
    filter.country = params.country
  }

  if (params?.name) {
    filter.name = { $regex: params.name, $options: 'i' }
  }

  const docs = await db.collection(COLLECTION_NAME).find(filter).toArray()

  return docs.map((doc) =>
    validateOverseasSiteRead({ ...doc, id: doc._id.toHexString() })
  )
}

/**
 * @param {Db} db
 * @returns {Promise<OverseasSitesRepositoryFactory>}
 */
export const createOverseasSitesRepository = async (db) => {
  await ensureCollection(db)

  return () => ({
    create: (site) => performCreate(db, site),
    findAll: (params) => performFindAll(db, params),
    findById: (id) => performFindById(db, id),
    remove: (id) => performRemove(db, id),
    update: (id, updates) => performUpdate(db, id, updates)
  })
}
