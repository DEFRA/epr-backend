import {
  mapDocumentWithCurrentStatuses,
  organisationNumberNotFound,
  prepareLink,
  storedOrgId,
  versionConflict
} from './helpers.js'
import { validateUsers } from './schema/index.js'

/**
 * Finds the stored organisation to update at `version`. Throws 404 when the
 * organisation does not exist and 409 when it is at another version.
 */
const storedAtVersion = (storage, organisationNumber, version) => {
  const existing = storage.find(
    (o) => o.orgId === storedOrgId(organisationNumber)
  )
  if (!existing) {
    throw organisationNumberNotFound(organisationNumber)
  }
  if (existing.version !== version) {
    throw versionConflict(version, existing.version)
  }
  return existing
}

/**
 * The stored organisation as the MongoDB adapter reads it before an update,
 * so both adapters prepare updates from the same shape.
 */
const asRead = (stored) =>
  mapDocumentWithCurrentStatuses(structuredClone(stored))

export const performLinkDefraOrganisation =
  (storage, syncStaleCache) =>
  async (organisationNumber, version, linkedDefraOrganisation) => {
    const existing = storedAtVersion(storage, organisationNumber, version)
    const link = prepareLink(asRead(existing), linkedDefraOrganisation)

    existing.linkedDefraOrganisation = structuredClone(
      link.linkedDefraOrganisation
    )
    if (link.statusHistoryEntry) {
      existing.statusHistory.push(link.statusHistoryEntry)
    }
    existing.version += 1

    syncStaleCache()
  }

export const performUnlinkDefraOrganisation =
  (storage, syncStaleCache) => async (organisationNumber, version) => {
    const existing = storedAtVersion(storage, organisationNumber, version)

    delete existing.linkedDefraOrganisation
    existing.version += 1

    syncStaleCache()
  }

export const performReplaceUsers =
  (storage, syncStaleCache) => async (organisationNumber, version, users) => {
    const existing = storedAtVersion(storage, organisationNumber, version)

    existing.users = structuredClone(validateUsers(users))
    existing.version += 1

    syncStaleCache()
  }
