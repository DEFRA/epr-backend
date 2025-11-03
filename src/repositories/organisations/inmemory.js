import {
  validateId,
  validateOrganisationInsert,
  validateOrganisationUpdate
} from './validation.js'
import {
  SCHEMA_VERSION,
  createInitialStatusHistory,
  getCurrentStatus,
  statusHistoryWithChanges,
  mergeSubcollection
} from './helpers.js'
import Boom from '@hapi/boom'

const MAX_CONSISTENCY_RETRIES = 10
const CONSISTENCY_RETRY_DELAY_MS = 10

/**
 * @typedef {{ id: string, [key: string]: any }} Organisation
 */

const enrichItemsWithStatus = (items) => {
  for (const item of items) {
    item.status = getCurrentStatus(item)
  }
}

const enrichWithCurrentStatus = (org) => {
  org.status = getCurrentStatus(org)
  enrichItemsWithStatus(org.registrations)
  enrichItemsWithStatus(org.accreditations)
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

const performInsert = (storage, staleCache, organisation) => {
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
    accreditations
  })

  storage.push(newOrg)
  // Insert is immediately visible (no lag simulation for inserts)
  staleCache.push(structuredClone(newOrg))
}

const performUpdate = (
  storage,
  staleCache,
  pendingSyncRef,
  id,
  version,
  updates
) => {
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

  storage[existingIndex] = {
    ...merged,
    statusHistory: statusHistoryWithChanges(validatedUpdates, existing),
    registrations,
    accreditations,
    version: existing.version + 1
  }

  // Schedule async staleCache update
  scheduleStaleCacheSync(storage, staleCache, pendingSyncRef)
}

const performFindById = (staleCache, id) => {
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

/**
 * Create an in-memory organisations repository.
 * Ensures data isolation by deep-cloning on store and on read.
 *
 * @param {Organisation[]} [initialOrganisations=[]]
 * @returns {import('./port.js').OrganisationsRepositoryFactory}
 */
export const createInMemoryOrganisationsRepository = (
  initialOrganisations = []
) => {
  const storage = structuredClone(initialOrganisations)
  const staleCache = structuredClone(initialOrganisations)
  const pendingSyncRef = { current: null }

  return () => ({
    async insert(organisation) {
      return performInsert(storage, staleCache, organisation)
    },

    async update(id, version, updates) {
      return performUpdate(
        storage,
        staleCache,
        pendingSyncRef,
        id,
        version,
        updates
      )
    },

    async findAll() {
      return structuredClone(staleCache).map((org) =>
        enrichWithCurrentStatus({ ...org })
      )
    },

    async findById(id, expectedVersion) {
      for (let i = 0; i < MAX_CONSISTENCY_RETRIES; i++) {
        try {
          const result = performFindById(staleCache, id)

          // No version expectation - return immediately (may be stale)
          if (expectedVersion === undefined) {
            return result
          }

          // Version matches - consistency achieved
          if (result.version >= expectedVersion) {
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
      throw Boom.internal('Consistency timeout waiting for expected version')
    },

    async findRegistrationById(
      organisationId,
      registrationId,
      expectedOrgVersion
    ) {
      for (let i = 0; i < MAX_CONSISTENCY_RETRIES; i++) {
        const org = staleCache.find((o) => o.id === organisationId)

        if (!org) {
          // No org found - retry in case it's propagating
          if (
            expectedOrgVersion === undefined ||
            i === MAX_CONSISTENCY_RETRIES - 1
          ) {
            return null
          }
        } else {
          // No version expectation - return immediately
          if (expectedOrgVersion === undefined) {
            const registration = org.registrations?.find(
              (r) => r.id === registrationId
            )
            return registration ? structuredClone(registration) : null
          }

          // Version matches - consistency achieved
          if (org.version >= expectedOrgVersion) {
            const registration = org.registrations?.find(
              (r) => r.id === registrationId
            )
            return registration ? structuredClone(registration) : null
          }
        }

        // Wait before retry
        if (i < MAX_CONSISTENCY_RETRIES - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, CONSISTENCY_RETRY_DELAY_MS)
          )
        }
      }

      // Timeout
      throw Boom.internal('Consistency timeout waiting for expected version')
    }
  })
}
