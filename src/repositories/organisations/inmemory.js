import Boom from '@hapi/boom'
import {
  validateId,
  validateOrganisationInsert,
  validateOrganisationUpdate
} from './schema/index.js'
import {
  createInitialStatusHistory,
  mapDocumentWithCurrentStatuses,
  SCHEMA_VERSION,
  prepareForReplace
} from './helpers.js'

// Aggressive retry settings for in-memory testing (setImmediate() is microseconds)
const MAX_CONSISTENCY_RETRIES = 5
const CONSISTENCY_RETRY_DELAY_MS = 5

/**
 * @typedef {{ id: string, [key: string]: any }} Organisation
 */

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

  const existing = storage.find((o) => o._id === id)
  if (existing) {
    throw Boom.conflict(`Organisation with ${id} already exists`)
  }

  const registrations = initializeItems(orgFields.registrations)
  const accreditations = initializeItems(orgFields.accreditations)

  const newOrg = structuredClone({
    _id: id,
    version: 1,
    schemaVersion: SCHEMA_VERSION,
    statusHistory: createInitialStatusHistory(),
    users: [],
    ...orgFields,
    formSubmissionTime: new Date(orgFields.formSubmissionTime),
    registrations,
    accreditations
  })

  storage.push(newOrg)
  // Insert is immediately visible (no lag simulation for inserts)
  staleCache.push(structuredClone(newOrg))
}

const performReplace =
  (storage, staleCache, pendingSyncRef) => async (id, version, updates) => {
    const validatedId = validateId(id)

    const existingIndex = storage.findIndex((o) => o._id === validatedId)
    const existing = storage[existingIndex]

    if (existingIndex === -1) {
      throw Boom.notFound(`Organisation with id ${validatedId} not found`)
    }

    const validatedUpdates = validateOrganisationUpdate(updates)

    if (existing.version !== version) {
      throw Boom.conflict(
        `Version conflict: attempted to update with version ${version} but current version is ${existing.version}`
      )
    }

    const replaced = prepareForReplace(
      mapDocumentWithCurrentStatuses(existing),
      validatedUpdates
    )

    storage[existingIndex] = { _id: existing._id, ...replaced }

    // Schedule async staleCache update
    scheduleStaleCacheSync(storage, staleCache, pendingSyncRef)
  }

const performFindById = (staleCache) => (id) => {
  try {
    validateId(id)
  } catch (validationError) {
    throw Boom.notFound(`Organisation with id ${id} not found`, {
      cause: validationError
    })
  }

  const found = staleCache.find((o) => o._id === id)
  if (!found) {
    throw Boom.notFound(`Organisation with id ${id} not found`)
  }

  return mapDocumentWithCurrentStatuses(structuredClone(found))
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
    mapDocumentWithCurrentStatuses({ ...org })
  )
}

const performFindAllIds = (staleCache) => async () => {
  const orgs = structuredClone(staleCache)

  return orgs.reduce(
    (acc, org) => {
      acc.organisations.add(org._id)
      for (const r of org.registrations) {
        acc.registrations.add(r.id)
      }
      for (const a of org.accreditations) {
        acc.accreditations.add(a.id)
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

const performFindAccreditationById =
  (findById) => async (organisationId, accreditationId, minimumOrgVersion) => {
    const org = await findById(organisationId, minimumOrgVersion)
    const accreditation = org.accreditations?.find(
      (a) => a.id === accreditationId
    )

    if (!accreditation) {
      throw Boom.notFound(`Accreditation with id ${accreditationId} not found`)
    }

    return structuredClone(accreditation)
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
  const storage = initialOrganisations.map(({ id, ...rest }) => ({
    _id: id,
    ...rest
  }))

  const staleCache = structuredClone(storage)
  const pendingSyncRef = { current: null }

  const findByIdFromCache = performFindById(staleCache)

  return () => {
    const findById = performFindByIdWithRetry(findByIdFromCache)
    const insertFn = performInsert(storage, staleCache)
    const replaceFn = performReplace(storage, staleCache, pendingSyncRef)

    return {
      insert: insertFn,
      replace: replaceFn,
      findAll: performFindAll(staleCache),
      findAllIds: performFindAllIds(staleCache),
      findById,
      findRegistrationById: performFindRegistrationById(findById),
      findAccreditationById: performFindAccreditationById(findById),
      // Test-only method to access internal storage (not part of the port interface)
      _getStorageForTesting: () => storage
    }
  }
}
