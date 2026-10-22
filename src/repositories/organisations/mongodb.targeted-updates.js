import {
  mapDocumentWithCurrentStatuses,
  organisationNumberNotFound,
  prepareLink,
  prepareUsers,
  storedOrgId,
  versionConflict
} from './helpers.js'

/** @import { Collection } from 'mongodb' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */

/**
 * Updates read the organisation they change from the primary. The configured
 * read preference defaults to `secondary`, which can lag a write the caller
 * has already seen, and would then report a 409 or 404 that is not true.
 */
const FROM_PRIMARY = /** @type {const} */ ({ readPreference: 'primary' })

/**
 * Throws the reason no organisation matched `{ orgId, version }`: 404 when
 * the organisation does not exist, 409 when it is at another version.
 *
 * @param {Collection} collection
 * @param {OrganisationNumber} organisationNumber
 * @param {number} version
 * @returns {Promise<never>}
 */
const throwMissing = async (collection, organisationNumber, version) => {
  const current = await collection.findOne(
    { orgId: storedOrgId(organisationNumber) },
    { ...FROM_PRIMARY, projection: { version: 1 } }
  )
  if (!current) {
    throw organisationNumberNotFound(organisationNumber)
  }
  throw versionConflict(version, current.version)
}

/**
 * Reads the organisation to update at `version`. Throws 404 when the
 * organisation does not exist and 409 when it is at another version.
 *
 * @param {Collection} collection
 * @param {OrganisationNumber} organisationNumber
 * @param {number} version
 * @returns {Promise<Organisation>}
 */
const findAtVersion = async (collection, organisationNumber, version) => {
  const existing = await collection.findOne(
    { orgId: storedOrgId(organisationNumber), version },
    FROM_PRIMARY
  )
  if (!existing) {
    return throwMissing(collection, organisationNumber, version)
  }
  return mapDocumentWithCurrentStatuses(existing)
}

/**
 * Applies a targeted update to the organisation at `version`, and bumps the
 * version. Throws 404 when the organisation does not exist and 409 when it is
 * at another version.
 *
 * @param {Collection} collection
 * @param {OrganisationNumber} organisationNumber
 * @param {number} version
 * @param {object} update - a MongoDB update document
 * @returns {Promise<void>}
 */
const updateAtVersion = async (
  collection,
  organisationNumber,
  version,
  update
) => {
  const result = await collection.updateOne(
    { orgId: storedOrgId(organisationNumber), version },
    { ...update, $inc: { version: 1 } }
  )
  if (result.matchedCount === 0) {
    await throwMissing(collection, organisationNumber, version)
  }
}

/** @param {Collection} collection */
export const performLinkDefraOrganisation =
  (collection) =>
  async (organisationNumber, version, linkedDefraOrganisation) => {
    const existing = await findAtVersion(
      collection,
      organisationNumber,
      version
    )
    const link = prepareLink(existing, linkedDefraOrganisation)
    await updateAtVersion(collection, organisationNumber, version, {
      $set: { linkedDefraOrganisation: link.linkedDefraOrganisation },
      ...(link.statusHistoryEntry && {
        $push: { statusHistory: link.statusHistoryEntry }
      })
    })
  }

/** @param {Collection} collection */
export const performUnlinkDefraOrganisation =
  (collection) => async (organisationNumber, version) => {
    await updateAtVersion(collection, organisationNumber, version, {
      $unset: { linkedDefraOrganisation: '' }
    })
  }

/** @param {Collection} collection */
export const performReplaceUsers =
  (collection) => async (organisationNumber, version, users) => {
    const existing = await findAtVersion(
      collection,
      organisationNumber,
      version
    )
    await updateAtVersion(collection, organisationNumber, version, {
      $set: { users: prepareUsers(existing, users) }
    })
  }
