import {
  escapeRegex,
  mapDocumentWithCurrentStatuses
} from '#repositories/organisations/helpers.js'
import { COLLECTION_NAME } from '#repositories/organisations/mongodb.js'
import {
  anchoredPattern,
  normaliseCriteria,
  parseOrgIdCriterion
} from './search-criteria.js'

/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { Db, Document, Filter } from 'mongodb' */
/** @import { FindParams } from './port.js' */
/** @import { SearchCriteria } from './search-criteria.js' */

/**
 * How the MongoDB organisation read repository reads the stored
 * organisations: one at a time, a page of a search, or all of them.
 */

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

/** Matches no organisation, used when a criterion cannot be parsed. */
const UNSATISFIABLE_FILTER = { _id: { $in: [] } }

/**
 * @param {string} value
 * @returns {{ $regex: string, $options: string }} - anchored, case-insensitive
 */
const anchoredCaseInsensitive = (value) => ({
  $regex: anchoredPattern(value),
  $options: 'i'
})

/**
 * @param {string} value
 * @returns {object} - the organisation-id fragment, unsatisfiable when unparseable
 */
const buildOrgIdFilter = (value) => {
  const orgId = parseOrgIdCriterion(value)
  return orgId === null ? UNSATISFIABLE_FILTER : { orgId }
}

/**
 * Builds the MongoDB filter for a find query. The in-memory equivalent is in
 * inmemory-find.js; the shared criteria semantics live in search-criteria.js and the
 * find contract tests hold the two implementations to the same behaviour.
 *
 * @param {SearchCriteria} criteria
 * @returns {object} - a filter matching organisations satisfying every criterion
 */
const buildFindFilter = (criteria) => {
  const {
    search,
    organisationNumber,
    registrationNumber,
    accreditationNumber
  } = normaliseCriteria(criteria)

  const conditions = []
  if (search !== '') {
    conditions.push({
      'companyDetails.name': { $regex: escapeRegex(search), $options: 'i' }
    })
  }
  if (organisationNumber !== '') {
    conditions.push(buildOrgIdFilter(organisationNumber))
  }
  if (registrationNumber !== '') {
    conditions.push({
      'registrations.registrationNumber':
        anchoredCaseInsensitive(registrationNumber)
    })
  }
  if (accreditationNumber !== '') {
    conditions.push({
      'accreditations.accreditationNumber':
        anchoredCaseInsensitive(accreditationNumber)
    })
  }

  return conditions.length === 0 ? {} : { $and: conditions }
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
