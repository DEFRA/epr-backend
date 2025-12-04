import Boom from '@hapi/boom'
import {
  SCHEMA_VERSION,
  collateUsersOnApproval,
  createInitialStatusHistory,
  getCurrentStatus,
  hasChanges,
  mergeSubcollection,
  statusHistoryWithChanges
} from './helpers.js'
import {
  validateId,
  validateOrganisationInsert,
  validateOrganisationUpdate
} from './schema/index.js'

// Aggressive retry settings for in-memory testing (setImmediate() is microseconds)
const MAX_CONSISTENCY_RETRIES = 5
const CONSISTENCY_RETRY_DELAY_MS = 5

/**
 * @typedef {{ id: string, [key: string]: any }} Organisation
 */

const enrichWithCurrentStatus = (org) => {
  org.status = getCurrentStatus(org)

  for (const item of org.registrations) {
    item.status = getCurrentStatus(item)
  }

  for (const item of org.accreditations) {
    item.status = getCurrentStatus(item)
  }

  return org
}

const initializeItems = (items) =>
  items?.map((item) => ({
    ...item,
    formSubmissionTime: new Date(item.formSubmissionTime),
    statusHistory: createInitialStatusHistory()
  })) || []

const scheduleStaleCacheSync = (storage, staleCache, pendingSyncRef) => {
  // Cancel any pending sync
  if (pendingSyncRef.current !== null) {
    clearImmediate(pendingSyncRef.current)
  }

  // Schedule sync for next tick
  pendingSyncRef.current = setImmediate(() => {
    staleCache.length = 0
    staleCache.push(...structuredClone(storage))
    pendingSyncRef.current = null
  })
}

const performInsert = (storage, staleCache) => async (organisation) => {
  const validated = validateOrganisationInsert(organisation)
  const { id, ...orgFields } = validated

  const existing = storage.find((o) => o.id === id)
  if (existing) {
    throw Boom.conflict(`Organisation with ${id} already exists`)
  }

  const registrations = initializeItems(orgFields.registrations)
  const accreditations = initializeItems(orgFields.accreditations)

  const newOrg = structuredClone({
    id,
    version: 1,
    schemaVersion: SCHEMA_VERSION,
    statusHistory: createInitialStatusHistory(),
    ...orgFields,
    formSubmissionTime: new Date(orgFields.formSubmissionTime),
    registrations,
    accreditations,
    users: []
  })

  storage.push(newOrg)
  // Insert is immediately visible (no lag simulation for inserts)
  staleCache.push(structuredClone(newOrg))
}

const performUpdate =
  (storage, staleCache, pendingSyncRef) => async (id, version, updates) => {
    const validatedId = validateId(id)
    const validatedUpdates = validateOrganisationUpdate(updates)

    const existingIndex = storage.findIndex((o) => o.id === validatedId)
    if (existingIndex === -1) {
      throw Boom.notFound(`Organisation with id ${validatedId} not found`)
    }

    const existing = storage[existingIndex]

    if (existing.version !== version) {
      throw Boom.conflict(
        `Version conflict: attempted to update with version ${version} but current version is ${existing.version}`
      )
    }

    const { status: _, ...merged } = { ...existing, ...validatedUpdates }

    const registrations = mergeSubcollection(
      existing.registrations,
      validatedUpdates.registrations
    )
    const accreditations = mergeSubcollection(
      existing.accreditations,
      validatedUpdates.accreditations
    )

    const updatedStatusHistory = statusHistoryWithChanges(
      validatedUpdates,
      existing
    )

    const users = collateUsersOnApproval(existing, {
      ...merged,
      statusHistory: updatedStatusHistory,
      registrations,
      accreditations
    })

    const updatePayload = {
      ...merged,
      statusHistory: updatedStatusHistory,
      registrations,
      accreditations,
      users,
      version: existing.version + 1
    }

    storage[existingIndex] = updatePayload

    // Schedule async staleCache update
    scheduleStaleCacheSync(storage, staleCache, pendingSyncRef)
  }

const performUpsert =
  (storage, staleCache, pendingSyncRef, insertFn, updateFn) =>
  async (organisation) => {
    const validated = validateOrganisationInsert(organisation)
    const { id, version: _v, schemaVersion: _s, ...updateData } = validated

    const existing = storage.find((o) => o.id === id)

    if (!existing) {
      await insertFn(organisation)
      return { action: 'inserted', id }
    }

    if (!hasChanges(existing, validated)) {
      return { action: 'unchanged', id }
    }

    await updateFn(id, existing.version, updateData)
    scheduleStaleCacheSync(storage, staleCache, pendingSyncRef)
    return { action: 'updated', id }
  }

const performFindById = (staleCache) => (id) => {
  try {
    validateId(id)
  } catch (validationError) {
    throw Boom.notFound(`Organisation with id ${id} not found`, {
      cause: validationError
    })
  }

  const found = staleCache.find((o) => o.id === id)
  if (!found) {
    throw Boom.notFound(`Organisation with id ${id} not found`)
  }

  return enrichWithCurrentStatus(structuredClone(found))
}

const performFindByIdWithRetry =
  (findByIdFromCache) => async (id, minimumVersion) => {
    for (let i = 0; i < MAX_CONSISTENCY_RETRIES; i++) {
      try {
        const result = findByIdFromCache(id)

        // No version expectation - return immediately (may be stale)
        if (minimumVersion === undefined) {
          return result
        }

        // Version matches - consistency achieved
        if (result.version >= minimumVersion) {
          return result
        }
      } catch (error) {
        // Document not found - retry in case it's propagating
        if (i === MAX_CONSISTENCY_RETRIES - 1) {
          throw error
        }
      }

      // Wait before retry
      if (i < MAX_CONSISTENCY_RETRIES - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, CONSISTENCY_RETRY_DELAY_MS)
        )
      }
    }

    // Timeout - throw error
    throw Boom.internal('Consistency timeout waiting for minimum version')
  }

const performFindAll = (staleCache) => async () => {
  return structuredClone(staleCache).map((org) =>
    enrichWithCurrentStatus({ ...org })
  )
}

const performFindRegistrationById =
  (findById) => async (organisationId, registrationId, minimumOrgVersion) => {
    const org = await findById(organisationId, minimumOrgVersion)
    const registration = org.registrations?.find((r) => r.id === registrationId)

    if (!registration) {
      throw Boom.notFound(`Registration with id ${registrationId} not found`)
    }

    // Hydrate with accreditation if accreditationId exists
    if (registration.accreditationId) {
      const accreditation = org.accreditations?.find(
        (a) => a.id === registration.accreditationId
      )
      if (accreditation) {
        return structuredClone({
          ...registration,
          accreditation
        })
      }
    }

    return structuredClone(registration)
  }

/**
 * Create an in-memory organisations repository.
 * Ensures data isolation by deep-cloning on store and on read.
 * Uses aggressive retry settings optimized for setImmediate() sync timing.
 *
 * @param {Organisation[]} [initialOrganisations=[]]
 * @returns {import('./port.js').OrganisationsRepositoryFactory}
 */
export const createInMemoryOrganisationsRepository = (
  initialOrganisations = []
) => {
  const storage = structuredClone(initialOrganisations)
  const staleCache = structuredClone(storage)
  const pendingSyncRef = { current: null }

  const findByIdFromCache = performFindById(staleCache)

  return () => {
    const findById = performFindByIdWithRetry(findByIdFromCache)
    const insertFn = performInsert(storage, staleCache)
    const updateFn = performUpdate(storage, staleCache, pendingSyncRef)

    return {
      insert: insertFn,
      update: updateFn,
      upsert:
        /** @type {(organisation: Object) => Promise<import('./port.js').UpsertResult>} */ (
          performUpsert(storage, staleCache, pendingSyncRef, insertFn, updateFn)
        ),
      findAll: performFindAll(staleCache),
      findById,
      findRegistrationById: performFindRegistrationById(findById),
      // Test-only method to access internal storage (not part of the port interface)
      _getStorageForTesting: () => storage
    }
  }
}
