/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import { FindParams, OrganisationsRepositoryFactory } from './port.js' */
/** @import { NumberHolder, StoredOrganisation, WriteOperation } from './helpers.js' */

import Boom from '@hapi/boom'
import {
  LINKABLE_ORGANISATION_STATUSES,
  USER_ROLES
} from '#domain/organisations/model.js'
import { validateId, validateOrganisationInsert } from './schema/index.js'
import {
  createInitialStatusHistory,
  duplicateKeyConflict,
  mapDocumentWithCurrentStatuses,
  organisationNumberOfStored,
  prepareForReplace,
  storedOrgId,
  toStoredFields,
  toStoredOrganisation,
  UNIQUE_NUMBER_FIELDS,
  versionConflict
} from './helpers.js'
import { getCurrentStatus } from './status.js'
import {
  performLinkDefraOrganisation,
  performReplaceUsers,
  performUnlinkDefraOrganisation
} from './inmemory.targeted-updates.js'
import { findPage } from './inmemory-find.js'
import { CURRENT_SCHEMA_VERSION } from '#repositories/organisations/schema/helpers.js'

// Aggressive retry settings for in-memory testing (setImmediate() is microseconds)
const MAX_CONSISTENCY_RETRIES = 5
const CONSISTENCY_RETRY_DELAY_MS = 5

const initializeItems = (items) =>
  items?.map((item) => ({
    ...item,
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

/**
 * Stands in for the unique indexes the MongoDB adapter holds on each number,
 * which span organisations.
 *
 * @param {Array<NumberHolder & { _id: string }>} storage
 * @param {string} id - the organisation being written
 * @param {NumberHolder} organisation - as it will be stored
 * @param {WriteOperation} operation
 */
const assertNumbersUnheldElsewhere = (storage, id, organisation, operation) => {
  const others = storage.filter((org) => org._id !== id)

  for (const { items, field, label, numbersOf } of UNIQUE_NUMBER_FIELDS) {
    const heldElsewhere = new Set(others.flatMap(numbersOf))
    const repeated = numbersOf(organisation).find(
      (number) => typeof number === 'string' && heldElsewhere.has(number)
    )

    if (repeated) {
      throw duplicateKeyConflict({
        operation,
        id,
        conflictFields: `${items}.${field}`,
        reason: `fields=${items}.${field}`,
        heldNumber: { label, number: repeated }
      })
    }
  }
}

/**
 * Stands in for the MongoDB adapter's unique index on orgId.
 *
 * @param {Array<{ _id: string, orgId: number }>} storage
 * @param {string} id - the organisation being written
 * @param {number} orgId - as it will be stored
 * @param {WriteOperation} operation
 */
const assertOrgIdUnheldElsewhere = (storage, id, orgId, operation) => {
  if (storage.some((org) => org._id !== id && org.orgId === orgId)) {
    throw duplicateKeyConflict({
      operation,
      id,
      conflictFields: 'orgId',
      reason: 'fields=orgId'
    })
  }
}

const performInsert = (storage, staleCache) => async (organisation) => {
  const validated = validateOrganisationInsert(toStoredFields(organisation))
  const { id, ...orgFields } = validated

  const existing = storage.find((o) => o._id === id)
  if (existing) {
    throw Boom.conflict(`Organisation with ${id} already exists`)
  }

  assertOrgIdUnheldElsewhere(storage, id, orgFields.orgId, 'inserting')
  const registrations = initializeItems(orgFields.registrations)
  const accreditations = initializeItems(orgFields.accreditations)
  assertNumbersUnheldElsewhere(
    storage,
    id,
    { registrations, accreditations },
    'inserting'
  )

  const newOrg = structuredClone({
    _id: id,
    version: 1,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    statusHistory: createInitialStatusHistory(),
    users: [],
    ...orgFields,
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

    if (existing.version !== version) {
      throw versionConflict(version, existing.version)
    }

    const replaced = prepareForReplace(
      mapDocumentWithCurrentStatuses(structuredClone(existing)),
      updates
    )

    assertOrgIdUnheldElsewhere(
      storage,
      existing._id,
      replaced.orgId,
      'updating'
    )
    assertNumbersUnheldElsewhere(storage, existing._id, replaced, 'updating')
    storage[existingIndex] = { _id: existing._id, ...replaced }

    // Schedule async staleCache update
    scheduleStaleCacheSync(storage, staleCache, pendingSyncRef)
  }

/**
 * Reads the one organisation `predicate` matches, retrying until its version
 * is at least `minimumVersion`. Without `minimumVersion` it reads once.
 * Resolves null when no organisation matches, and throws 500 when the version
 * never arrives.
 *
 * @param {Object[]} staleCache
 * @param {(org: Object) => boolean} predicate
 * @param {number} [minimumVersion]
 */
const findOneAtMinimumVersion = async (
  staleCache,
  predicate,
  minimumVersion
) => {
  for (let i = 0; i < MAX_CONSISTENCY_RETRIES; i++) {
    const found = staleCache.find(predicate)
    const isLastRetry = i === MAX_CONSISTENCY_RETRIES - 1

    if (found) {
      if (minimumVersion === undefined || found.version >= minimumVersion) {
        return mapDocumentWithCurrentStatuses(structuredClone(found))
      }
      // Document exists but version too low - will retry
    } else if (minimumVersion === undefined || isLastRetry) {
      return null
    } else {
      // Document not found but have retries left - will retry
    }

    if (!isLastRetry) {
      await new Promise((resolve) =>
        setTimeout(resolve, CONSISTENCY_RETRY_DELAY_MS)
      )
    }
  }

  throw Boom.internal('Consistency timeout waiting for minimum version')
}

const performFindById = (staleCache) => async (id, minimumVersion) => {
  try {
    validateId(id)
  } catch {
    throw Boom.notFound(`Organisation with id ${id} not found`)
  }

  const found = await findOneAtMinimumVersion(
    staleCache,
    (o) => o._id === id,
    minimumVersion
  )
  if (!found) {
    throw Boom.notFound(`Organisation with id ${id} not found`)
  }
  return found
}

const performFindAll = (staleCache) => async () => {
  return structuredClone(staleCache).map((org) =>
    mapDocumentWithCurrentStatuses({ ...org })
  )
}

const performFind =
  (/** @type {StoredOrganisation[]} */ staleCache) =>
  async (/** @type {FindParams} */ params) =>
    findPage(
      structuredClone(staleCache).map((org) =>
        mapDocumentWithCurrentStatuses(org)
      ),
      params
    )

/** @returns {import('./port.js').OrganisationSummary} */
const toOrganisationSummary = (org) => ({
  id: org._id.toString(),
  organisationNumber: organisationNumberOfStored(org.orgId),
  companyDetails: { name: org.companyDetails.name },
  status: getCurrentStatus(org)
})

/** @returns {import('./port.js').LinkedOrganisationSummary} */
const toLinkedOrganisationSummary = (org) => ({
  ...toOrganisationSummary(org),
  linkedDefraOrganisation: {
    ...structuredClone(org.linkedDefraOrganisation),
    linkedAt: new Date(org.linkedDefraOrganisation.linkedAt).toISOString()
  }
})

const performFindAllLinked =
  (staleCache) =>
  async (filter = {}) => {
    let matches = staleCache.filter((org) => org.linkedDefraOrganisation?.orgId)

    if (filter.name) {
      const nameLower = filter.name.toLowerCase()
      matches = matches.filter((org) =>
        org.companyDetails.name.toLowerCase().includes(nameLower)
      )
    }

    return matches.map(toLinkedOrganisationSummary)
  }

/**
 * @returns {import('./port.js').OrganisationsRepository['findByOrganisationNumbers']}
 */
const performFindByOrganisationNumbers =
  (staleCache) => async (organisationNumbers) => {
    const orgIds = new Set(organisationNumbers.map(storedOrgId))
    return structuredClone(staleCache)
      .filter((org) => orgIds.has(org.orgId))
      .map((org) => mapDocumentWithCurrentStatuses({ ...org }))
  }

const performFindByLinkedDefraOrgId = (staleCache) => async (defraOrgId) => {
  const found = staleCache.find(
    (o) => o.linkedDefraOrganisation?.orgId === defraOrgId
  )

  if (!found) {
    return null
  }

  return toLinkedOrganisationSummary(found)
}

const performIsAccreditationNumberInUse =
  (staleCache) => async (accreditationNumber) =>
    staleCache.some((org) =>
      org.accreditations.some(
        (acc) => acc.accreditationNumber === accreditationNumber
      )
    )

const performIsRegistrationNumberInUse =
  (staleCache) => async (registrationNumber) =>
    staleCache.some((org) =>
      org.registrations.some(
        (reg) => reg.registrationNumber === registrationNumber
      )
    )

const caseInsensitiveEquals = (a, b) =>
  a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0

const performFindAllLinkableForUser = (staleCache) => async (email) => {
  const matches = staleCache.filter((org) => {
    // Must not be linked
    if (org.linkedDefraOrganisation) {
      return false
    }

    // Must be approved, or active but unlinked (re-linkable after unlinking)
    if (!LINKABLE_ORGANISATION_STATUSES.includes(getCurrentStatus(org))) {
      return false
    }

    // User must be an initial user
    const isInitialUser = org.users?.some(
      (user) =>
        caseInsensitiveEquals(user.email, email) &&
        user.roles?.includes(USER_ROLES.INITIAL)
    )

    return isInitialUser
  })

  return matches.map(toOrganisationSummary)
}

const performFindByOrganisationNumber =
  (staleCache) => (organisationNumber, minimumVersion) =>
    findOneAtMinimumVersion(
      staleCache,
      (o) => o.orgId === storedOrgId(organisationNumber),
      minimumVersion
    )

const performReplaceRegistrationOverseasSites =
  (storage, staleCache, pendingSyncRef) =>
  async (id, version, registrationId, entries) => {
    const existingIndex = storage.findIndex((o) => o._id === id)
    if (existingIndex === -1) {
      return false
    }

    const existing = storage[existingIndex]
    if (existing.version !== version) {
      return false
    }

    const registration = existing.registrations?.find(
      (r) => r.id === registrationId
    )
    if (!registration) {
      return false
    }

    registration.overseasSites = { ...entries }

    existing.version += 1

    scheduleStaleCacheSync(storage, staleCache, pendingSyncRef)
    return true
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

/**
 * @param {Array<{ orgId: number }>} storage
 * @returns {import('./port.js').OrganisationsRepository['findHighestOrganisationNumber']}
 */
const performFindHighestOrganisationNumber = (storage) => async () => {
  if (storage.length === 0) {
    return null
  }
  return organisationNumberOfStored(
    Math.max(...storage.map(({ orgId }) => orgId))
  )
}

/**
 * @param {Array<{ orgId: number }>} records
 * @param {number} orgId
 */
const removeByOrgId = (records, orgId) => {
  const index = records.findIndex((org) => org.orgId === orgId)
  if (index === -1) {
    return 0
  }
  records.splice(index, 1)
  return 1
}

/**
 * @param {Array<{ orgId: number }>} storage
 * @param {Array<{ orgId: number }>} staleCache
 * @returns {import('./port.js').OrganisationsRepository['deleteByOrganisationNumber']}
 */
const performDeleteByOrganisationNumber =
  (storage, staleCache) => async (organisationNumber) => {
    const orgId = storedOrgId(organisationNumber)
    removeByOrgId(staleCache, orgId)
    return removeByOrgId(storage, orgId)
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
 * @returns {OrganisationsRepositoryFactory}
 */
export const createInMemoryOrganisationsRepository = (
  initialOrganisations = []
) => {
  const storage = initialOrganisations.map(({ id, ...rest }) => ({
    _id: id,
    ...toStoredOrganisation(rest)
  }))
  storage.forEach(({ _id, orgId }, index) =>
    assertOrgIdUnheldElsewhere(storage.slice(0, index), _id, orgId, 'inserting')
  )

  const staleCache = structuredClone(storage)
  const pendingSyncRef = { current: null }
  const syncStaleCache = () =>
    scheduleStaleCacheSync(storage, staleCache, pendingSyncRef)

  return () => {
    const findById = performFindById(staleCache)
    const insertFn = performInsert(storage, staleCache)
    const replaceFn = performReplace(storage, staleCache, pendingSyncRef)

    return {
      insert: insertFn,
      replace: replaceFn,
      linkDefraOrganisation: performLinkDefraOrganisation(
        storage,
        syncStaleCache
      ),
      unlinkDefraOrganisation: performUnlinkDefraOrganisation(
        storage,
        syncStaleCache
      ),
      replaceUsers: performReplaceUsers(storage, syncStaleCache),
      findAll: performFindAll(staleCache),
      find: performFind(staleCache),
      findAllLinked: performFindAllLinked(staleCache),
      findAllIds: performFindAllIds(staleCache),
      findById,
      findByOrganisationNumbers: performFindByOrganisationNumbers(staleCache),
      findByLinkedDefraOrgId: performFindByLinkedDefraOrgId(staleCache),
      isAccreditationNumberInUse: performIsAccreditationNumberInUse(staleCache),
      isRegistrationNumberInUse: performIsRegistrationNumberInUse(staleCache),
      findAllLinkableForUser: performFindAllLinkableForUser(staleCache),
      findByOrganisationNumber: performFindByOrganisationNumber(staleCache),
      findHighestOrganisationNumber:
        performFindHighestOrganisationNumber(storage),
      deleteByOrganisationNumber: performDeleteByOrganisationNumber(
        storage,
        staleCache
      ),
      replaceRegistrationOverseasSites: performReplaceRegistrationOverseasSites(
        storage,
        staleCache,
        pendingSyncRef
      ),
      findRegistrationById: performFindRegistrationById(findById),
      findAccreditationById: performFindAccreditationById(findById),
      // Test-only method to access internal storage (not part of the port interface)
      _getStorageForTesting: () => storage
    }
  }
}
