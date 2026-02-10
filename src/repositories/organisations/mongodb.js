import Boom from '@hapi/boom'
import { ObjectId } from 'mongodb'
import { REG_ACC_STATUS, USER_ROLES } from '#domain/organisations/model.js'
import {
  createInitialStatusHistory,
  getCurrentStatus,
  mapDocumentWithCurrentStatuses,
  prepareForReplace,
  SCHEMA_VERSION
} from './helpers.js'
import { validateId, validateOrganisationInsert } from './schema/index.js'

const COLLECTION_NAME = 'epr-organisations'
const MONGODB_DUPLICATE_KEY_ERROR_CODE = 11000

/**
 * Ensures the collection exists with required indexes.
 * Safe to call multiple times - MongoDB createIndex is idempotent.
 *
 * @param {import('mongodb').Db} db
 * @returns {Promise<import('mongodb').Collection>}
 */
async function ensureCollection(db) {
  const collection = db.collection(COLLECTION_NAME)

  // Create unique indexes to prevent duplicates
  await collection.createIndex({ orgId: 1 }, { unique: true })
  await collection.createIndex(
    { 'registrations.id': 1 },
    { unique: true, sparse: true }
  )
  await collection.createIndex(
    { 'accreditations.id': 1 },
    { unique: true, sparse: true }
  )
  await collection.createIndex({ 'linkedDefraOrganisation.orgId': 1 })

  return collection
}
// Production-safe defaults for multi-AZ MongoDB w:majority (typical p99 lag: 100-200ms)
const DEFAULT_MAX_CONSISTENCY_RETRIES = 20
const DEFAULT_CONSISTENCY_RETRY_DELAY_MS = 25

const performInsert = (db) => async (organisation) => {
  const validated = validateOrganisationInsert(organisation)
  const { id, ...orgFields } = validated

  const registrations =
    orgFields.registrations?.map((reg) => ({
      ...reg,
      statusHistory: createInitialStatusHistory()
    })) || []

  const accreditations =
    orgFields.accreditations?.map((acc) => ({
      ...acc,
      statusHistory: createInitialStatusHistory()
    })) || []

  try {
    await db.collection(COLLECTION_NAME).insertOne({
      _id: ObjectId.createFromHexString(id),
      version: 1,
      schemaVersion: SCHEMA_VERSION,
      statusHistory: createInitialStatusHistory(),
      ...orgFields,
      registrations,
      accreditations,
      users: []
    })
  } catch (error) {
    if (error.code === MONGODB_DUPLICATE_KEY_ERROR_CODE) {
      throw Boom.conflict(
        `Organisation with ${id} already exists - ${error.message}`
      )
    }
    throw error
  }
}

const performReplace = (db) => async (id, version, updates) => {
  const validatedId = validateId(id)

  const existing = await db
    .collection(COLLECTION_NAME)
    .findOne({ _id: ObjectId.createFromHexString(validatedId) })
  if (!existing) {
    throw Boom.notFound(`Organisation with id ${validatedId} not found`)
  }

  const result = await db
    .collection(COLLECTION_NAME)
    .replaceOne(
      { _id: ObjectId.createFromHexString(validatedId), version },
      prepareForReplace(mapDocumentWithCurrentStatuses(existing), updates)
    )

  if (result.matchedCount === 0) {
    throw Boom.conflict(
      `Version conflict: attempted to update with version ${version} but current version is ${existing.version}`
    )
  }
}

const handleFoundDocument = (doc, minimumVersion) => {
  const mapped = mapDocumentWithCurrentStatuses(doc)

  // No version expectation - return immediately
  if (minimumVersion === undefined) {
    return { shouldReturn: true, result: mapped }
  }

  // Version matches - return
  if (mapped.version >= minimumVersion) {
    return { shouldReturn: true, result: mapped }
  }

  // Version doesn't match yet - retry
  return { shouldReturn: false }
}

const performFindById =
  (db, maxRetries, retryDelayMs) => async (id, minimumVersion) => {
    // validate the ID and throw early
    let validatedId
    try {
      validatedId = validateId(id)
    } catch (_error) {
      throw Boom.notFound(`Organisation with id ${id} not found`)
    }

    for (let i = 0; i < maxRetries; i++) {
      const doc = await db
        .collection(COLLECTION_NAME)
        .findOne({ _id: ObjectId.createFromHexString(validatedId) })

      const isLastRetry = i === maxRetries - 1

      if (doc) {
        const { shouldReturn, result } = handleFoundDocument(
          doc,
          minimumVersion
        )
        if (shouldReturn) {
          return result
        }
        // Document exists but version too low - will retry
      } else if (minimumVersion === undefined || isLastRetry) {
        throw Boom.notFound(`Organisation with id ${id} not found`)
      } else {
        // Document not found but have retries left - will retry
      }

      // Wait before next retry
      if (!isLastRetry) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      }
    }

    // Exhausted retries waiting for minimum version
    throw Boom.internal('Consistency timeout waiting for minimum version')
  }

const performFindAll = (db) => async () => {
  const docs = await db.collection(COLLECTION_NAME).find().toArray()
  return docs.map((doc) => mapDocumentWithCurrentStatuses(doc))
}

const LINKED_ORG_PROJECTION = {
  orgId: 1,
  'companyDetails.name': 1,
  statusHistory: 1,
  linkedDefraOrganisation: 1
}

const toLinkedOrganisationSummary = (doc) => ({
  id: doc._id.toString(),
  orgId: doc.orgId,
  companyDetails: { name: doc.companyDetails.name },
  status: getCurrentStatus(doc),
  linkedDefraOrganisation: {
    ...doc.linkedDefraOrganisation,
    linkedAt: new Date(doc.linkedDefraOrganisation.linkedAt).toISOString()
  }
})

const performFindAllLinked =
  (db) =>
  async (filter = {}) => {
    const query = { 'linkedDefraOrganisation.orgId': { $ne: null } }

    if (filter.name) {
      query['companyDetails.name'] = {
        $regex: escapeRegex(filter.name),
        $options: 'i'
      }
    }

    const docs = await db
      .collection(COLLECTION_NAME)
      .find(query, { projection: LINKED_ORG_PROJECTION })
      .toArray()
    return docs.map(toLinkedOrganisationSummary)
  }

const performFindByIds = (db) => async (ids) => {
  if (!ids || ids.length === 0) {
    return []
  }

  const objectIds = ids.map((id) => {
    const validatedId = validateId(id)
    return ObjectId.createFromHexString(validatedId)
  })

  const docs = await db
    .collection(COLLECTION_NAME)
    .find({ _id: { $in: objectIds } })
    .toArray()

  return docs.map((doc) => mapDocumentWithCurrentStatuses(doc))
}

const performFindByLinkedDefraOrgId = (db) => async (defraOrgId) => {
  const doc = await db
    .collection(COLLECTION_NAME)
    .findOne({ 'linkedDefraOrganisation.orgId': defraOrgId })

  if (!doc) {
    return null
  }

  return mapDocumentWithCurrentStatuses(doc)
}

const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const performFindAllLinkableForUser = (db) => async (email) => {
  const docs = await db
    .collection(COLLECTION_NAME)
    .find({
      // Must not be linked
      linkedDefraOrganisation: { $exists: false },
      // Must be approved (check last status in statusHistory)
      $expr: {
        $eq: [
          { $arrayElemAt: ['$statusHistory.status', -1] },
          REG_ACC_STATUS.APPROVED
        ]
      },
      // User must be an initial user (case-insensitive email match)
      users: {
        $elemMatch: {
          email: { $regex: new RegExp(`^${escapeRegex(email)}$`, 'i') },
          roles: USER_ROLES.INITIAL
        }
      }
    })
    .toArray()

  return docs.map((doc) => mapDocumentWithCurrentStatuses(doc))
}

const findAllIds = (db) => async () => {
  const docs = await db
    .collection(COLLECTION_NAME)
    .aggregate([
      {
        $project: {
          _id: 1,
          registrations: '$registrations.id',
          accreditations: '$accreditations.id'
        }
      }
    ])
    .toArray()

  return docs.reduce(
    (acc, doc) => {
      acc.organisations.add(doc._id.toString())
      for (const id of doc.registrations) {
        acc.registrations.add(id)
      }
      for (const id of doc.accreditations) {
        acc.accreditations.add(id)
      }
      return acc
    },
    {
      organisations: new Set(),
      registrations: new Set(),
      accreditations: new Set()
    }
  )
}

/**
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @param {{maxRetries?: number, retryDelayMs?: number}} [eventualConsistencyConfig] - Eventual consistency retry configuration
 * @returns {Promise<import('./port.js').OrganisationsRepositoryFactory>}
 */
export const createOrganisationsRepository = async (
  db,
  eventualConsistencyConfig
) => {
  await ensureCollection(db)

  return () => {
    const maxRetries =
      eventualConsistencyConfig?.maxRetries ?? DEFAULT_MAX_CONSISTENCY_RETRIES
    const retryDelayMs =
      eventualConsistencyConfig?.retryDelayMs ??
      DEFAULT_CONSISTENCY_RETRY_DELAY_MS

    const findById = performFindById(db, maxRetries, retryDelayMs)

    return {
      insert: performInsert(db),
      replace: performReplace(db),
      findById,
      findAll: performFindAll(db),
      findAllLinked: performFindAllLinked(db),
      findByIds: performFindByIds(db),
      findAllIds: findAllIds(db),
      findByLinkedDefraOrgId: performFindByLinkedDefraOrgId(db),
      findAllLinkableForUser: performFindAllLinkableForUser(db),

      async findRegistrationById(
        organisationId,
        registrationId,
        minimumOrgVersion
      ) {
        const org = await findById(organisationId, minimumOrgVersion)
        const registration = org.registrations?.find(
          (r) => r.id === registrationId
        )

        if (!registration) {
          throw Boom.notFound(
            `Registration with id ${registrationId} not found`
          )
        }

        // Hydrate with accreditation if accreditationId exists
        if (registration.accreditationId) {
          const accreditation = org.accreditations?.find(
            (a) => a.id === registration.accreditationId
          )
          if (accreditation) {
            return {
              ...registration,
              accreditation
            }
          }
        }

        return registration
      },

      async findAccreditationById(
        organisationId,
        accreditationId,
        minimumOrgVersion
      ) {
        const org = await findById(organisationId, minimumOrgVersion)
        const accreditation = org.accreditations?.find(
          (a) => a.id === accreditationId
        )

        if (!accreditation) {
          throw Boom.notFound(
            `Accreditation with id ${accreditationId} not found`
          )
        }

        return accreditation
      }
    }
  }
}
