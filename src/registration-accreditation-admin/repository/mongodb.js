import Boom from '@hapi/boom'
import { ObjectId } from 'mongodb'
import { classifierTail } from '#common/helpers/logging/cdp-boom.js'
import {
  duplicateKeyConflict,
  mapDocumentWithCurrentStatuses,
  prepareForReplace,
  storedOrgId,
  UNIQUE_NUMBER_FIELDS,
  versionConflict
} from '#repositories/organisations/helpers.js'
import {
  COLLECTION_NAME,
  DEFAULT_CONSISTENCY_RETRY_DELAY_MS,
  DEFAULT_MAX_CONSISTENCY_RETRIES,
  findOneAtMinimumVersion
} from '#repositories/organisations/mongodb-find.js'
import { validateId } from '#repositories/organisations/schema/index.js'
import {
  performFindAccreditationById,
  performFindRegistrationById
} from './find-in-organisation.js'

/** @import { Db } from 'mongodb' */
/** @import { HeldNumber } from '#repositories/organisations/helpers.js' */
/** @import { RegistrationAccreditationAdminRepository } from './port.js' */

const MONGODB_DUPLICATE_KEY_ERROR_CODE = 11000

/**
 * @param {{ keyValue?: Record<string, unknown> }} error
 * @returns {HeldNumber | undefined}
 */
const heldNumberOf = ({ keyValue }) => {
  for (const { items, field, label } of UNIQUE_NUMBER_FIELDS) {
    const number = keyValue?.[`${items}.${field}`]
    if (typeof number === 'string') {
      return { label, number }
    }
  }
  return undefined
}

/**
 * @param {Error & { code: number, keyPattern?: Record<string, number>, keyValue?: Record<string, unknown> }} error
 * @param {string} id
 * @returns {never}
 */
const throwCuratedDuplicateKeyBoom = (error, id) => {
  const conflictFields = error.keyPattern
    ? Object.keys(error.keyPattern).join(', ')
    : 'unknown'
  throw duplicateKeyConflict({
    operation: 'updating',
    id,
    conflictFields,
    reason: `fields=${conflictFields} ${classifierTail(error)}`,
    heldNumber: heldNumberOf(error)
  })
}

/**
 * @param {Db} db
 * @returns {RegistrationAccreditationAdminRepository['replace']}
 */
const performReplace = (db) => async (id, version, updates) => {
  const validatedId = validateId(id)

  const existing = await db
    .collection(COLLECTION_NAME)
    .findOne({ _id: ObjectId.createFromHexString(validatedId) })
  if (!existing) {
    throw Boom.notFound(`Organisation with id ${validatedId} not found`)
  }

  let result
  try {
    result = await db
      .collection(COLLECTION_NAME)
      .replaceOne(
        { _id: ObjectId.createFromHexString(validatedId), version },
        prepareForReplace(mapDocumentWithCurrentStatuses(existing), updates)
      )
  } catch (error) {
    if (error.code === MONGODB_DUPLICATE_KEY_ERROR_CODE) {
      throwCuratedDuplicateKeyBoom(error, validatedId)
    }
    throw error
  }

  if (result.matchedCount === 0) {
    throw versionConflict(version, existing.version)
  }
}

/**
 * @param {Db} db
 * @param {number} maxRetries
 * @param {number} retryDelayMs
 * @returns {RegistrationAccreditationAdminRepository['findById']}
 */
const performFindById =
  (db, maxRetries, retryDelayMs) => async (id, minimumVersion) => {
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      throw Boom.notFound(`Organisation with id ${id} not found`)
    }

    const found = await findOneAtMinimumVersion(
      db,
      maxRetries,
      retryDelayMs,
      { _id: ObjectId.createFromHexString(validateId(id)) },
      minimumVersion
    )
    if (!found) {
      throw Boom.notFound(`Organisation with id ${id} not found`)
    }
    return found
  }

/**
 * @param {Db} db
 * @param {number} maxRetries
 * @param {number} retryDelayMs
 * @returns {RegistrationAccreditationAdminRepository['findByOrganisationNumber']}
 */
const performFindByOrganisationNumber =
  (db, maxRetries, retryDelayMs) => (organisationNumber, minimumVersion) =>
    findOneAtMinimumVersion(
      db,
      maxRetries,
      retryDelayMs,
      { orgId: storedOrgId(organisationNumber) },
      minimumVersion
    )

/**
 * @param {Db} db
 * @param {Record<string, unknown>} filter
 */
const isInUse = async (db, filter) =>
  (await db
    .collection(COLLECTION_NAME)
    .findOne(filter, { projection: { _id: 1 } })) !== null

/**
 * Reads and writes the organisations collection, whose indexes the
 * organisations repository creates.
 *
 * @param {Db} db
 * @param {{maxRetries?: number, retryDelayMs?: number}} [eventualConsistencyConfig]
 * @returns {() => RegistrationAccreditationAdminRepository}
 */
export const createRegistrationAccreditationAdminRepository = (
  db,
  eventualConsistencyConfig
) => {
  const maxRetries =
    eventualConsistencyConfig?.maxRetries ?? DEFAULT_MAX_CONSISTENCY_RETRIES
  const retryDelayMs =
    eventualConsistencyConfig?.retryDelayMs ??
    DEFAULT_CONSISTENCY_RETRY_DELAY_MS

  return () => {
    const findById = performFindById(db, maxRetries, retryDelayMs)

    return {
      replace: performReplace(db),
      findById,
      findByOrganisationNumber: performFindByOrganisationNumber(
        db,
        maxRetries,
        retryDelayMs
      ),
      findRegistrationById: performFindRegistrationById(findById),
      findAccreditationById: performFindAccreditationById(findById),
      isAccreditationNumberInUse: (accreditationNumber) =>
        isInUse(db, {
          'accreditations.accreditationNumber': accreditationNumber
        }),
      isRegistrationNumberInUse: (registrationNumber) =>
        isInUse(db, { 'registrations.registrationNumber': registrationNumber })
    }
  }
}
