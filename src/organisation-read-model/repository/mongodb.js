import Boom from '@hapi/boom'

import {
  anchoredPattern,
  escapeRegex,
  mapDocumentWithCurrentStatuses,
  normaliseCriteria,
  parseOrgIdCriterion,
  storedOrgId
} from '#repositories/organisations/helpers.js'
import { toReadModelOrganisations } from './to-read-model.js'

/** @import { Db, Document, Filter } from 'mongodb' */
/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { Organisation as StoredOrganisation } from '#domain/organisations/model.js' */
/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */
/** @import { FindParams, OrganisationReadRepository } from './port.js' */

/**
 * Written by the organisations repository, which owns its indexes.
 */
const COLLECTION_NAME = 'epr-organisations'

// Production-safe defaults for multi-AZ MongoDB w:majority (typical p99 lag: 100-200ms)
const DEFAULT_MAX_CONSISTENCY_RETRIES = 20
const DEFAULT_CONSISTENCY_RETRY_DELAY_MS = 25

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
 * @returns {Promise<StoredOrganisation | null>}
 */
const findOneAtMinimumVersion = async (
  db,
  maxRetries,
  retryDelayMs,
  filter,
  minimumVersion
) => {
  for (let i = 0; i < maxRetries; i++) {
    const doc = await db.collection(COLLECTION_NAME).findOne(filter)

    const isLastRetry = i === maxRetries - 1

    if (doc) {
      if (minimumVersion === undefined || doc.version >= minimumVersion) {
        return mapDocumentWithCurrentStatuses(doc)
      }
      // Document exists but version too low - will retry
    } else if (minimumVersion === undefined || isLastRetry) {
      return null
    } else {
      // Document not found but have retries left - will retry
    }

    if (!isLastRetry) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    }
  }

  throw Boom.internal('Consistency timeout waiting for minimum version')
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
 * @returns {object} - the organisation-number fragment, unsatisfiable when unparseable
 */
const buildOrgIdFilter = (value) => {
  const orgId = parseOrgIdCriterion(value)
  return orgId === null ? UNSATISFIABLE_FILTER : { orgId }
}

/**
 * @param {Omit<FindParams, 'page' | 'pageSize'>} criteria
 * @returns {object} - a filter matching organisations satisfying every criterion
 */
const buildFindFilter = ({ organisationNumber, ...criteria }) => {
  const { search, orgId, registrationNumber, accreditationNumber } =
    normaliseCriteria({ ...criteria, orgId: organisationNumber })

  const conditions = []
  if (search !== '') {
    conditions.push({
      'companyDetails.name': { $regex: escapeRegex(search), $options: 'i' }
    })
  }
  if (orgId !== '') {
    conditions.push(buildOrgIdFilter(orgId))
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
 * @param {Db} db
 * @param {FindParams} params
 * @returns {Promise<{ items: StoredOrganisation[], page: number, pageSize: number, totalItems: number, totalPages: number }>}
 */
const findPage = async (db, { page, pageSize, ...criteria }) => {
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
 * Reads the organisations collection directly and serves what it finds in the
 * read model's shape.
 *
 * @param {Db} db
 * @param {{ maxRetries?: number, retryDelayMs?: number }} [eventualConsistencyConfig]
 * @returns {(dependencies: {
 *   overseasSitesRepository: Pick<OverseasSitesRepository, 'findByIds'>
 *   logger: Pick<TypedLogger, 'warn'>
 * }) => OrganisationReadRepository}
 */
export const createOrganisationReadRepository = (
  db,
  eventualConsistencyConfig
) => {
  const maxRetries =
    eventualConsistencyConfig?.maxRetries ?? DEFAULT_MAX_CONSISTENCY_RETRIES
  const retryDelayMs =
    eventualConsistencyConfig?.retryDelayMs ??
    DEFAULT_CONSISTENCY_RETRY_DELAY_MS

  return (dependencies) => ({
    findByOrganisationNumber: async (organisationNumber, minimumVersion) => {
      const stored = await findOneAtMinimumVersion(
        db,
        maxRetries,
        retryDelayMs,
        { orgId: storedOrgId(organisationNumber) },
        minimumVersion
      )
      if (!stored) {
        return null
      }
      const [organisation] = await toReadModelOrganisations(
        [stored],
        dependencies
      )
      return organisation ?? null
    },

    find: async (params) => {
      const { items, ...page } = await findPage(db, params)
      return {
        ...page,
        items: await toReadModelOrganisations(items, dependencies)
      }
    }
  })
}
