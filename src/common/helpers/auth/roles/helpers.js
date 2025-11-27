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
  return !!organisation.users.find(
    (user) => user.email === email && !!user.isInitialUser
  )
}

/**
 * @param {TokenPayload} tokenPayload
 * @returns {Array<{defraIdRelationshipId: string, defraIdOrgId: string, defraIdOrgName: string, isCurrent: boolean}>}
 */
export function getOrgDataFromDefraIdToken(tokenPayload) {
  const { currentRelationshipId, relationships } = tokenPayload

  console.log('relationships', relationships)

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
export async function findOrganisationMatches(
  email,
  defraIdOrgId,
  organisationsRepository
) {
  const linkedOrganisations = []
  const unlinkedOrganisations = []

  return {
    all: [...unlinkedOrganisations, ...linkedOrganisations].reduce(
      (prev, organisation) =>
        prev.find(({ id }) => id === organisation.id)
          ? prev
          : [...prev, organisation],
      []
    ),
    unlinked: unlinkedOrganisations,
    linked: linkedOrganisations
  }
}
