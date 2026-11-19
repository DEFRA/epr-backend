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
 * Reads the one organisation `predicate` matches, retrying until its version
 * is at least `minimumVersion`. Without `minimumVersion` it reads once.
 * Resolves null when no organisation matches, and throws 500 when the version
 * never arrives.
 *
 * @param {Object[]} storage
 * @param {(org: Object) => boolean} predicate
 * @param {number} [minimumVersion]
 */
const findOneAtMinimumVersion = async (storage, predicate, minimumVersion) => {
  for (let i = 0; i < MAX_CONSISTENCY_RETRIES; i++) {
    const found = storage.find(predicate)
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
 * @returns {RegistrationAccreditationAdminRepository['replace']}
 */
const performReplace = (storage) => async (id, version, updates) => {
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
  storage[existingIndex] = { _id: existing._id, ...replaced }
}

/**
 * @param {Object[]} storage
 * @returns {RegistrationAccreditationAdminRepository['findById']}
 */
const performFindById = (storage) => async (id, minimumVersion) => {
  try {
    validateId(id)
  } catch {
    throw Boom.notFound(`Organisation with id ${id} not found`)
  }

  const found = await findOneAtMinimumVersion(
    storage,
    (o) => o._id === id,
    minimumVersion
  )
  if (!found) {
    throw Boom.notFound(`Organisation with id ${id} not found`)
  }
  return found
}

/**
 * @param {RegistrationAccreditationAdminRepository['findById']} findById
 * @returns {RegistrationAccreditationAdminRepository['findRegistrationById']}
 */
const performFindRegistrationById =
  (findById) => async (organisationId, registrationId, minimumOrgVersion) => {
    const org = await findById(organisationId, minimumOrgVersion)
    const registration = org.registrations?.find((r) => r.id === registrationId)

    if (!registration) {
      throw Boom.notFound(`Registration with id ${registrationId} not found`)
    }

    const accreditation =
      registration.accreditationId &&
      org.accreditations?.find((a) => a.id === registration.accreditationId)

    return accreditation ? { ...registration, accreditation } : registration
  }

/**
 * @param {RegistrationAccreditationAdminRepository['findById']} findById
 * @returns {RegistrationAccreditationAdminRepository['findAccreditationById']}
 */
const performFindAccreditationById =
  (findById) => async (organisationId, accreditationId, minimumOrgVersion) => {
    const org = await findById(organisationId, minimumOrgVersion)
    const accreditation = org.accreditations?.find(
      (a) => a.id === accreditationId
    )

    if (!accreditation) {
      throw Boom.notFound(`Accreditation with id ${accreditationId} not found`)
    }

    return accreditation
  }

/**
 * Reads and writes the store of an in-memory organisations repository, as the
 * MongoDB adapter shares the organisations repository's collection. It reads
 * what was last written, with no replication lag. The organisations
 * repository serves its own reads from a copy it refreshes only on its own
 * writes, so read back through this repository what it wrote.
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

  return () => {
    const findById = performFindById(storage)

    return {
      replace: performReplace(storage),
      findById,
      findByOrganisationNumber: (organisationNumber, minimumVersion) =>
        findOneAtMinimumVersion(
          storage,
          (o) => o.orgId === storedOrgId(organisationNumber),
          minimumVersion
        ),
      findRegistrationById: performFindRegistrationById(findById),
      findAccreditationById: performFindAccreditationById(findById),
      isAccreditationNumberInUse: async (accreditationNumber) =>
        storage.some((org) =>
          org.accreditations.some(
            (acc) => acc.accreditationNumber === accreditationNumber
          )
        ),
      isRegistrationNumberInUse: async (registrationNumber) =>
        storage.some((org) =>
          org.registrations.some(
            (reg) => reg.registrationNumber === registrationNumber
          )
        )
    }
  }
}
