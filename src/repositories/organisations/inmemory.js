/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import { FindParams, OrganisationsRepositoryFactory } from './port.js' */
/** @import { NumberHolder, WriteOperation } from './helpers.js' */

import Boom from '@hapi/boom'
import {
  LINKABLE_ORGANISATION_STATUSES,
  USER_ROLES
} from '#domain/organisations/model.js'
import { validateId, validateOrganisationInsert } from './schema/index.js'
import {
  anchoredPattern,
  createInitialStatusHistory,
  duplicateKeyConflict,
  escapeRegex,
  mapDocumentWithCurrentStatuses,
  normaliseCriteria,
  parseOrgIdCriterion,
  prepareForReplace,
  storedOrgId,
  UNIQUE_NUMBER_FIELDS,
  versionConflict
} from './helpers.js'
import { getCurrentStatus } from './status.js'
import {
  performLinkDefraOrganisation,
  performReplaceUsers,
  performUnlinkDefraOrganisation
} from './inmemory.targeted-updates.js'
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

  for (const { items, field, numbersOf } of UNIQUE_NUMBER_FIELDS) {
    const heldElsewhere = new Set(others.flatMap(numbersOf))
    const repeated = numbersOf(organisation).some(
      (number) => typeof number === 'string' && heldElsewhere.has(number)
    )

    if (repeated) {
      throw duplicateKeyConflict({
        operation,
        id,
        conflictFields: `${items}.${field}`,
        reason: `fields=${items}.${field}`
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
  const validated = validateOrganisationInsert(organisation)
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

const performFindById = (staleCache) => (id) => {
  try {
    validateId(id)
  } catch {
    throw Boom.notFound(`Organisation with id ${id} not found`)
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

/**
 * @param {string} value
 * @returns {(candidate: string | null | undefined) => boolean}
 */
const anchoredMatcher = (value) => {
  const pattern = new RegExp(anchoredPattern(value), 'i')
  return (candidate) => pattern.test(candidate ?? '')
}

/**
 * The in-memory equivalent of the MongoDB adapter's find filter, applied to
 * raw stored documents — so `_id` rather than `id`. The shared criteria
 * semantics live in helpers.js and the find contract tests hold the two
 * implementations to the same behaviour.
 *
 * @param {import('./port.js').SearchCriteria} criteria
 * @returns {(org: import('./helpers.js').StoredOrganisation) => boolean} - true when
 *   the organisation satisfies every criterion
 */
const buildFindMatcher = (criteria) => {
  const { search, orgId, registrationNumber, accreditationNumber } =
    normaliseCriteria(criteria)

  /** @type {Array<(org: import('./helpers.js').StoredOrganisation) => boolean>} */
  const checks = []
  if (search !== '') {
    const pattern = new RegExp(escapeRegex(search), 'i')
    checks.push((org) => pattern.test(org.companyDetails.name))
  }
  if (orgId !== '') {
    const wantedOrgId = parseOrgIdCriterion(orgId)
    checks.push((org) => org.orgId === wantedOrgId)
  }
  if (registrationNumber !== '') {
    const matchesNumber = anchoredMatcher(registrationNumber)
    checks.push((org) =>
      org.registrations.some((reg) => matchesNumber(reg.registrationNumber))
    )
  }
  if (accreditationNumber !== '') {
    const matchesNumber = anchoredMatcher(accreditationNumber)
    checks.push((org) =>
      org.accreditations.some((acc) => matchesNumber(acc.accreditationNumber))
    )
  }

  return (org) => checks.every((check) => check(org))
}

const performFind =
  (staleCache) =>
  async (/** @type {FindParams} */ { page, pageSize, ...criteria }) => {
    const matches = structuredClone(staleCache).filter(
      buildFindMatcher(criteria)
    )

    matches.sort((a, b) => {
      const aName = a.companyDetails.name
      const bName = b.companyDetails.name
      if (aName < bName) {
        return -1
      }
      if (aName > bName) {
        return 1
      }
      return 0
    })

    const totalItems = matches.length
    const totalPages = Math.ceil(totalItems / pageSize)
    const start = (page - 1) * pageSize
    const items = matches
      .slice(start, start + pageSize)
      .map((org) => mapDocumentWithCurrentStatuses({ ...org }))

    return { items, page, pageSize, totalItems, totalPages }
  }

/** @returns {import('./port.js').OrganisationSummary} */
const toOrganisationSummary = (org) => ({
  id: org._id.toString(),
  orgId: org.orgId,
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

const performFindByIds = (staleCache) => async (ids) => {
  if (!ids || ids.length === 0) {
    return []
  }

  const validIds = ids.map((id) => validateId(id))

  const idSet = new Set(validIds)
  return structuredClone(staleCache)
    .filter((org) => idSet.has(org._id))
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
  (staleCache) => async (organisationNumber, minimumVersion) => {
    for (let i = 0; i < MAX_CONSISTENCY_RETRIES; i++) {
      const found = staleCache.find(
        (o) => o.orgId === storedOrgId(organisationNumber)
      )
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
    ...rest
  }))
  storage.forEach(({ _id, orgId }, index) =>
    assertOrgIdUnheldElsewhere(storage.slice(0, index), _id, orgId, 'inserting')
  )

  const staleCache = structuredClone(storage)
  const pendingSyncRef = { current: null }
  const syncStaleCache = () =>
    scheduleStaleCacheSync(storage, staleCache, pendingSyncRef)

  const findByIdFromCache = performFindById(staleCache)

  return () => {
    const findById = performFindByIdWithRetry(findByIdFromCache)
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
      findByIds: performFindByIds(staleCache),
      findByLinkedDefraOrgId: performFindByLinkedDefraOrgId(staleCache),
      isAccreditationNumberInUse: performIsAccreditationNumberInUse(staleCache),
      isRegistrationNumberInUse: performIsRegistrationNumberInUse(staleCache),
      findAllLinkableForUser: performFindAllLinkableForUser(staleCache),
      findByOrganisationNumber: performFindByOrganisationNumber(staleCache),
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
