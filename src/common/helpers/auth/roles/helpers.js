import { organisationsLinkedGetAllPath } from '#domain/organisations/paths.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

/**
 * @typedef {Object} TokenPayload
 * @property {string} id - The user ID
 * @property {string} email - The user email
 * @property {string} currentRelationshipId - The current relationship ID
 * @property {string[]} relationships - Array of relationship strings in format "relationshipId:organisationId:organisationName"
 */

/**
 * @param {Object} organisation
 * @param {string} email
 * @returns {boolean}
 */
export function isInitialUser(organisation, email) {
  return organisation.users.some(
    (user) =>
      user.email.toLowerCase() === email.toLowerCase() && !!user.isInitialUser
  )
}

/**
 * @param {TokenPayload} tokenPayload
 * @returns {Array<{defraIdRelationshipId: string, defraIdOrgId: string, defraIdOrgName: string, isCurrent: boolean}>}
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
 * @param {Array<{defraIdRelationshipId: string, defraIdOrgId: string, defraIdOrgName: string, isCurrent: boolean}>} relationships - Array of relationship objects
 * @returns {{defraIdRelationshipId: string, defraIdOrgId: string, defraIdOrgName: string, isCurrent: boolean} | undefined} The current relationship or undefined if none found
 */
/**
 * Finds and returns the current relationship from an array of relationships
 * @param {Array<{defraIdRelationshipId: string, defraIdOrgId: string, defraIdOrgName: string, isCurrent: boolean}>} relationships - Array of relationship objects
 * @returns {{defraIdRelationshipId: string, defraIdOrgId: string, defraIdOrgName: string, isCurrent: boolean} | undefined} The current relationship or undefined if none found
 */
export function getCurrentRelationship(relationships) {
  return relationships.find(({ isCurrent }) => isCurrent)
}

/**
 * @param {TokenPayload} tokenPayload
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
 * @param {string} email
 * @param {string} defraIdOrgId
 * @param {OrganisationsRepository} organisationsRepository - The organisations repository
 * @returns {Promise<{all: Array, unlinked: Array, linked: Array}>}
 */
/**
 * Helper function to deduplicate organisations by ID
 * Exported for testing purposes
 * @param {Array} unlinkedOrganisations
 * @param {Array} linkedOrganisations
 * @returns {Array}
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
