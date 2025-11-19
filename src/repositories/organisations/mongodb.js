import {
  validateId,
  validateOrganisationInsert,
  validateOrganisationUpdate
} from './schema/index.js'
import {
  SCHEMA_VERSION,
  createInitialStatusHistory,
  getCurrentStatus,
  statusHistoryWithChanges,
  mergeSubcollection,
  hasChanges
} from './helpers.js'
import Boom from '@hapi/boom'
import { ObjectId } from 'mongodb'

const COLLECTION_NAME = 'epr-organisations'
const MONGODB_DUPLICATE_KEY_ERROR_CODE = 11000
// Production-safe defaults for multi-AZ MongoDB w:majority (typical p99 lag: 100-200ms)
const DEFAULT_MAX_CONSISTENCY_RETRIES = 20
const DEFAULT_CONSISTENCY_RETRY_DELAY_MS = 25

const mapDocumentWithCurrentStatuses = (org) => {
  const { _id, ...rest } = org

  rest.status = getCurrentStatus(rest)

  for (const item of rest.registrations ?? []) {
    item.status = getCurrentStatus(item)
  }

  for (const item of rest.accreditations ?? []) {
    item.status = getCurrentStatus(item)
  }
  return { id: _id.toString(), ...rest }
}

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
      accreditations
    })
  } catch (error) {
    if (error.code === MONGODB_DUPLICATE_KEY_ERROR_CODE) {
      throw Boom.conflict(`Organisation with ${id} already exists`)
    }
    throw error
  }
}

const performUpdate = (db) => async (id, version, updates) => {
  const validatedId = validateId(id)
  const validatedUpdates = validateOrganisationUpdate(updates)

  const existing = await db
    .collection(COLLECTION_NAME)
    .findOne({ _id: ObjectId.createFromHexString(validatedId) })

  if (!existing) {
    throw Boom.notFound(`Organisation with id ${validatedId} not found`)
  }

  const merged = {
    ...existing,
    ...validatedUpdates
  }

  const registrations = mergeSubcollection(
    existing.registrations,
    validatedUpdates.registrations
  )
  const accreditations = mergeSubcollection(
    existing.accreditations,
    validatedUpdates.accreditations
  )

  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: ObjectId.createFromHexString(validatedId), version },
    {
      $set: {
        ...merged,
        statusHistory: statusHistoryWithChanges(validatedUpdates, existing),
        registrations,
        accreditations,
        version: existing.version + 1
      }
    }
  )

  if (result.matchedCount === 0) {
    throw Boom.conflict(
      `Version conflict: attempted to update with version ${version} but current version is ${existing.version}`
    )
  }
}

const performUpsert = (db) => async (organisation) => {
  const validated = validateOrganisationInsert(organisation)
  const { id, version, schemaVersion, ...updateData } = validated

  const existing = await db
    .collection(COLLECTION_NAME)
    .findOne({ _id: ObjectId.createFromHexString(id) })

  if (!existing) {
    await performInsert(db)(organisation)
    return { action: 'inserted', id }
  }

  if (!hasChanges(mapDocumentWithCurrentStatuses(existing), validated)) {
    return { action: 'unchanged', id }
  }

  await performUpdate(db)(id, existing.version, updateData)
  return { action: 'updated', id }
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
    } catch (error) {
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

/**
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @param {{maxRetries?: number, retryDelayMs?: number}} [eventualConsistencyConfig] - Eventual consistency retry configuration
 * @returns {import('./port.js').OrganisationsRepositoryFactory}
 */
export const createOrganisationsRepository =
  (db, eventualConsistencyConfig) => () => {
    const maxRetries =
      eventualConsistencyConfig?.maxRetries ?? DEFAULT_MAX_CONSISTENCY_RETRIES
    const retryDelayMs =
      eventualConsistencyConfig?.retryDelayMs ??
      DEFAULT_CONSISTENCY_RETRY_DELAY_MS

    const findById = performFindById(db, maxRetries, retryDelayMs)

    return {
      insert: performInsert(db),
      update: performUpdate(db),
      upsert:
        /** @type {(organisation: Object) => Promise<import('./port.js').UpsertResult>} */ (
          performUpsert(db)
        ),
      findById,
      findAll: performFindAll(db),

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
      }
    }
  }
