import { ObjectId } from 'mongodb'

import {
  validateOverseasSiteId,
  validateOverseasSiteInsert,
  validateOverseasSiteRead
} from './validation.js'

/** @import { Collection, Db } from 'mongodb' */
/** @import { FindAllParams, OverseasSite, OverseasSitesRepositoryFactory } from './port.js' */

const escapeRegex = (string) =>
  string.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)

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
  const validatedId = validateOverseasSiteId(id)
  const doc = await db
    .collection(COLLECTION_NAME)
    .findOne({ _id: ObjectId.createFromHexString(validatedId) })

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
  const validatedId = validateOverseasSiteId(id)
  const result = await db
    .collection(COLLECTION_NAME)
    .findOneAndUpdate(
      { _id: ObjectId.createFromHexString(validatedId) },
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
  const validatedId = validateOverseasSiteId(id)
  const result = await db
    .collection(COLLECTION_NAME)
    .deleteOne({ _id: ObjectId.createFromHexString(validatedId) })

  return result.deletedCount > 0
}

/**
 * @param {Db} db
 * @param {object} properties
 * @param {string} properties.name
 * @param {string} properties.country
 * @param {import('./port.js').OverseasSiteAddress} properties.address
 * @param {string} [properties.coordinates]
 * @param {Date} [properties.validFrom]
 * @returns {Promise<OverseasSite | null>}
 */
const performFindByProperties = async (db, properties) => {
  /** @type {import('mongodb').Filter<import('mongodb').Document>} */
  const filter = {
    name: properties.name,
    country: properties.country,
    'address.line1': properties.address.line1,
    'address.townOrCity': properties.address.townOrCity
  }

  if (properties.address.line2 != null) {
    filter['address.line2'] = properties.address.line2
  } else {
    filter['address.line2'] = { $in: [null, undefined] }
  }

  if (properties.address.stateOrRegion != null) {
    filter['address.stateOrRegion'] = properties.address.stateOrRegion
  } else {
    filter['address.stateOrRegion'] = { $in: [null, undefined] }
  }

  if (properties.address.postcode != null) {
    filter['address.postcode'] = properties.address.postcode
  } else {
    filter['address.postcode'] = { $in: [null, undefined] }
  }

  if (properties.coordinates != null) {
    filter.coordinates = properties.coordinates
  } else {
    filter.coordinates = { $in: [null, undefined] }
  }

  if (properties.validFrom != null) {
    filter.validFrom = properties.validFrom
  } else {
    filter.validFrom = { $in: [null, undefined] }
  }

  const doc = await db.collection(COLLECTION_NAME).findOne(filter)

  if (!doc) {
    return null
  }

  return validateOverseasSiteRead({ ...doc, id: doc._id.toHexString() })
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
    filter.name = { $regex: escapeRegex(params.name), $options: 'i' }
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
    findByProperties: (properties) => performFindByProperties(db, properties),
    remove: (id) => performRemove(db, id),
    update: (id, updates) => performUpdate(db, id, updates)
  })
}
