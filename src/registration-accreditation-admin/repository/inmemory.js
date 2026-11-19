import Boom from '@hapi/boom'
import {
  duplicateKeyConflict,
  mapDocumentWithCurrentStatuses,
  prepareForReplace,
  storedOrgId,
  UNIQUE_NUMBER_FIELDS,
  versionConflict
} from '#repositories/organisations/helpers.js'
import { validateId } from '#repositories/organisations/schema/index.js'
import {
  performFindAccreditationById,
  performFindRegistrationById
} from './find-in-organisation.js'

/** @import { NumberHolder } from '#repositories/organisations/helpers.js' */
/** @import { RegistrationAccreditationAdminRepository } from './port.js' */

const MAX_CONSISTENCY_RETRIES = 5
const CONSISTENCY_RETRY_DELAY_MS = 5

/**
 * Stands in for the MongoDB unique indexes on each number, which span
 * organisations.
 *
 * @param {Array<NumberHolder & { _id: string }>} storage
 * @param {string} id - the organisation being written
 * @param {NumberHolder} organisation - as it will be stored
 */
const assertNumbersUnheldElsewhere = (storage, id, organisation) => {
  const others = storage.filter((org) => org._id !== id)

  for (const { items, field, label, numbersOf } of UNIQUE_NUMBER_FIELDS) {
    const heldElsewhere = new Set(others.flatMap(numbersOf))
    const repeated = numbersOf(organisation).find(
      (number) => typeof number === 'string' && heldElsewhere.has(number)
    )

    if (repeated) {
      throw duplicateKeyConflict({
        operation: 'updating',
        id,
        conflictFields: `${items}.${field}`,
        reason: `fields=${items}.${field}`,
        heldNumber: { label, number: repeated }
      })
    }
  }
}

/**
 * Stands in for the MongoDB unique index on orgId.
 *
 * @param {Array<{ _id: string, orgId: number }>} storage
 * @param {string} id - the organisation being written
 * @param {number} orgId - as it will be stored
 */
const assertOrgIdUnheldElsewhere = (storage, id, orgId) => {
  if (storage.some((org) => org._id !== id && org.orgId === orgId)) {
    throw duplicateKeyConflict({
      operation: 'updating',
      id,
      conflictFields: 'orgId',
      reason: 'fields=orgId'
    })
  }
}

/**
 * Serves reads from the store as it stood before this repository's last
 * write, until the next tick, as a MongoDB secondary lags its primary.
 *
 * @param {Object[]} storage
 */
const createLaggingReads = (storage) => {
  /** @type {Object[] | null} */
  let snapshot = null
  return {
    read: () => snapshot ?? storage,
    beforeWrite: () => {
      if (snapshot === null) {
        snapshot = structuredClone(storage)
        setImmediate(() => {
          snapshot = null
        })
      }
    }
  }
}

/**
 * Reads the one organisation `predicate` matches, retrying until its version
 * is at least `minimumVersion`. Without `minimumVersion` it reads once.
 * Resolves null when no organisation matches, and throws 500 when the version
 * never arrives.
 *
 * @param {() => Object[]} read
 * @param {(org: Object) => boolean} predicate
 * @param {number} [minimumVersion]
 */
const findOneAtMinimumVersion = async (read, predicate, minimumVersion) => {
  for (let i = 0; i < MAX_CONSISTENCY_RETRIES; i++) {
    const found = read().find(predicate)
    const isLastRetry = i === MAX_CONSISTENCY_RETRIES - 1

    if (found) {
      if (minimumVersion === undefined || found.version >= minimumVersion) {
        return mapDocumentWithCurrentStatuses(structuredClone(found))
      }
    } else if (minimumVersion === undefined || isLastRetry) {
      return null
    } else {
      // Not found yet, with retries left
    }

    if (!isLastRetry) {
      await new Promise((resolve) =>
        setTimeout(resolve, CONSISTENCY_RETRY_DELAY_MS)
      )
    }
  }

  throw Boom.internal('Consistency timeout waiting for minimum version')
}

/**
 * @param {Object[]} storage
 * @param {() => void} beforeWrite
 * @returns {RegistrationAccreditationAdminRepository['replace']}
 */
const performReplace =
  (storage, beforeWrite) => async (id, version, updates) => {
    const validatedId = validateId(id)

    const existingIndex = storage.findIndex((o) => o._id === validatedId)
    if (existingIndex === -1) {
      throw Boom.notFound(`Organisation with id ${validatedId} not found`)
    }

    const existing = storage[existingIndex]
    if (existing.version !== version) {
      throw versionConflict(version, existing.version)
    }

    const replaced = prepareForReplace(
      mapDocumentWithCurrentStatuses(structuredClone(existing)),
      updates
    )

    assertOrgIdUnheldElsewhere(storage, existing._id, replaced.orgId)
    assertNumbersUnheldElsewhere(storage, existing._id, replaced)
    beforeWrite()
    storage[existingIndex] = { _id: existing._id, ...replaced }
  }

/**
 * @param {() => Object[]} read
 * @returns {RegistrationAccreditationAdminRepository['findById']}
 */
const performFindById = (read) => async (id, minimumVersion) => {
  try {
    validateId(id)
  } catch {
    throw Boom.notFound(`Organisation with id ${id} not found`)
  }

  const found = await findOneAtMinimumVersion(
    read,
    (o) => o._id === id,
    minimumVersion
  )
  if (!found) {
    throw Boom.notFound(`Organisation with id ${id} not found`)
  }
  return found
}

/**
 * Reads and writes the store of an in-memory organisations repository, as the
 * MongoDB adapter shares the organisations repository's collection. The
 * organisations repository serves its own reads from a copy it refreshes only
 * on its own writes, so read back through this repository what it wrote.
 *
 * @param {object} organisationsRepository - from createInMemoryOrganisationsRepository
 * @returns {() => RegistrationAccreditationAdminRepository}
 */
export const createInMemoryRegistrationAccreditationAdminRepository = (
  organisationsRepository
) => {
  if (
    !('_getStorageForTesting' in organisationsRepository) ||
    typeof organisationsRepository._getStorageForTesting !== 'function'
  ) {
    throw new TypeError('Expected an in-memory organisations repository')
  }
  /** @type {Object[]} */
  const storage = organisationsRepository._getStorageForTesting()
  const { read, beforeWrite } = createLaggingReads(storage)

  return () => {
    const findById = performFindById(read)

    return {
      replace: performReplace(storage, beforeWrite),
      findById,
      findByOrganisationNumber: (organisationNumber, minimumVersion) =>
        findOneAtMinimumVersion(
          read,
          (o) => o.orgId === storedOrgId(organisationNumber),
          minimumVersion
        ),
      findRegistrationById: performFindRegistrationById(findById),
      findAccreditationById: performFindAccreditationById(findById),
      isAccreditationNumberInUse: async (accreditationNumber) =>
        read().some((org) =>
          org.accreditations.some(
            (acc) => acc.accreditationNumber === accreditationNumber
          )
        ),
      isRegistrationNumberInUse: async (registrationNumber) =>
        read().some((org) =>
          org.registrations.some(
            (reg) => reg.registrationNumber === registrationNumber
          )
        )
    }
  }
}
