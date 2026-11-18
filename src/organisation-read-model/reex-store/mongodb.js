import { buildFindFilter } from '#repositories/organisations/find-filter.js'
import { mapDocumentWithCurrentStatuses } from '#repositories/organisations/helpers.js'

/** @import { Db, Document, Filter } from 'mongodb' */
/** @import { Organisation as StoredOrganisation } from '#domain/organisations/model.js' */
/** @import { FindParams } from '../repository/port.js' */

/**
 * The organisations repository writes this collection. The read model reads
 * it here, and never through that repository.
 */
const ORGANISATIONS_COLLECTION_NAME = 'epr-organisations'

/**
 * @param {Db} db
 */
const organisations = (db) => db.collection(ORGANISATIONS_COLLECTION_NAME)

/**
 * The stored organisation `filter` matches, or null.
 *
 * @param {Db} db
 * @param {Filter<Document>} filter
 * @returns {Promise<StoredOrganisation | null>}
 */
export const findOne = async (db, filter) => {
  const doc = await organisations(db).findOne(filter)
  return doc ? mapDocumentWithCurrentStatuses(doc) : null
}

/**
 * The stored organisations matching every criterion, sorted by name, a page
 * at a time.
 *
 * @param {Db} db
 * @param {FindParams} params
 * @returns {Promise<{ items: StoredOrganisation[], page: number, pageSize: number, totalItems: number, totalPages: number }>}
 */
export const findPage = async (db, { page, pageSize, ...criteria }) => {
  const filter = buildFindFilter(criteria)
  const totalItems = await organisations(db).countDocuments(filter)
  const docs = await organisations(db)
    .find(filter)
    .sort({ 'companyDetails.name': 1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .toArray()

  return {
    items: docs.map((doc) => mapDocumentWithCurrentStatuses(doc)),
    page,
    pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pageSize)
  }
}

/**
 * Every stored organisation.
 *
 * @param {Db} db
 * @returns {Promise<StoredOrganisation[]>}
 */
export const findAll = async (db) => {
  const docs = await organisations(db).find().toArray()
  return docs.map((doc) => mapDocumentWithCurrentStatuses(doc))
}
