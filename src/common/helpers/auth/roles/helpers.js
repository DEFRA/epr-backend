import { organisationsLinkedGetAllPath } from '#domain/organisations/paths.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('../types.js').DefraIdTokenPayload} DefraIdTokenPayload */
/** @typedef {import('../types.js').DefraIdRelationship} DefraIdRelationship */
/** @typedef {import('#formsubmission/types.js').OrganisationUser} OrganisationUser */

/**
 * Finds a user in the organisation by email
 * @param {Object} organisation - The organisation object
 * @param {string} email - The user's email address in their Defra token
 * @param {string} contactId - The user's contact Id in their Defra token
 * @returns {OrganisationUser | null | undefined} The user if found, null if no users array exists, undefined if user not found
 */
export function findUserInOrg(organisation, email, contactId) {
  const { users } = organisation

  if (!users) {
    return null
  }

  return organisation.users.find(
    (user) =>
      user.email.toLowerCase() === email.toLowerCase() ||
      user.contactId === contactId
  )
}

/**
 * Checks if a user is the initial user of an organisation
 * @param {Object} organisation - The organisation object
 * @param {string} email - The user's email address
 * @returns {boolean} True if the user is the initial user
 */
export function isInitialUser(organisation, email) {
  return organisation.users.some(
    (user) =>
      user.email.toLowerCase() === email.toLowerCase() &&
      user.roles?.includes('initial_user')
  )
}

/**
 * Extracts and parses organization data from a Defra ID token
 * @param {DefraIdTokenPayload} tokenPayload - The Defra ID token payload
 * @returns {DefraIdRelationship[]} Array of parsed relationship objects
 */
export function getOrgDataFromDefraIdToken(tokenPayload) {
  const { currentRelationshipId, relationships } = tokenPayload

  return relationships.map((relationship) => {
    const [relationshipId, organisationId, organisationName] =
      relationship.split(':')

    return {
      defraIdRelationshipId: relationshipId,
      defraIdOrgId: organisationId,
      defraIdOrgName: organisationName?.trim(),
      isCurrent: currentRelationshipId === relationshipId
    }
  })
}

/**
 * Finds and returns the current relationship from an array of relationships
 * @param {DefraIdRelationship[]} relationships - Array of relationship objects
 * @returns {DefraIdRelationship | undefined} The current relationship or undefined if none found
 */
export function getCurrentRelationship(relationships) {
  return relationships.find(({ isCurrent }) => isCurrent)
}

/**
 * Extracts a summary of organization data from a Defra ID token
 * @param {DefraIdTokenPayload} tokenPayload - The Defra ID token payload
 * @returns {{defraIdOrgId?: string, defraIdOrgName?: string, defraIdRelationships: DefraIdRelationship[]}} Summary object containing current org ID, name, and all relationships
 */
export function getDefraTokenSummary(tokenPayload) {
  const defraIdRelationships = getOrgDataFromDefraIdToken(tokenPayload)
  const { defraIdOrgId, defraIdOrgName } =
    getCurrentRelationship(defraIdRelationships) || {}

  return { defraIdOrgId, defraIdOrgName, defraIdRelationships }
}

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository}} request
 * @returns {boolean}
 */
export function isOrganisationsDiscoveryReq(request) {
  return (
    request.path === organisationsLinkedGetAllPath && request.method === 'get'
  )
}

/**
 * Helper function to deduplicate organisations by ID
 *
 * Exported for testing purposes
 *
 * @param {Array} unlinkedOrganisations - Array of unlinked organisations
 * @param {Array} linkedOrganisations - Array of linked organisations
 * @returns {Array} Deduplicated array of organisations
 */
export function deduplicateOrganisations(
  unlinkedOrganisations,
  linkedOrganisations
) {
  return [...unlinkedOrganisations, ...linkedOrganisations].reduce(
    (prev, organisation) =>
      prev.some(({ id }) => id === organisation.id)
        ? prev
        : [...prev, organisation],
    []
  )
}

/**
 * Finds organization matches for a user based on email and Defra ID org ID
 * @param {string} _email - The user's email address
 * @param {string} _defraIdOrgId - The Defra ID organization ID
 * @param {OrganisationsRepository} _organisationsRepository - The organisations repository
 * @returns {Promise<{all: Array, unlinked: Array, linked: Array}>} Object containing all, unlinked, and linked organizations
 */
export async function findOrganisationMatches(
  _email,
  _defraIdOrgId,
  _organisationsRepository
) {
  // Note: This function currently returns empty arrays as the organization matching
  // logic is not yet implemented. The arrays below will be populated in a future
  // implementation when the repository queries are added.

  const linkedOrganisations = []
  const unlinkedOrganisations = []

  // Deduplicate organizations to ensure each organization appears only once in the 'all' array
  const all = deduplicateOrganisations(
    unlinkedOrganisations,
    linkedOrganisations
  )

  return {
    all,
    unlinked: unlinkedOrganisations,
    linked: linkedOrganisations
  }
}
