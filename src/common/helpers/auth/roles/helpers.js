import { USER_ROLES } from '#domain/organisations/model.js'
import { organisationsLinkedGetAllPath } from '#domain/organisations/paths.js'

/** @import {DefraIdRelationship, DefraIdTokenPayload} from '../types.js' */
/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {OrganisationUser} from '#formsubmission/types.js' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */

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
 * Performs a case-insensitive string comparison
 * see: https://stackoverflow.com/a/2140723
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
const stringEquals = (a, b) =>
  a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0

/**
 * Checks if a user is the initial user of an organisation
 * @param {string} email - The user's email address
 * @returns {(organisation: Organisation) => boolean} Function that checks if the user is an initial user
 */
export const isInitialUser = (email) => (organisation) =>
  organisation.users.some(
    (user) =>
      stringEquals(user.email, email) && user.roles.includes(USER_ROLES.INITIAL)
  )

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
 * @param {string} defraIdOrgId - The Defra ID organization ID
 * @param {OrganisationsRepository} organisationsRepository - The organisations repository
 * @returns Promise<{Organisation | undefined}> The matched organisation or undefined if none found
 */
export async function findOrganisationMatches(
  defraIdOrgId,
  organisationsRepository
) {
  // Note: This function currently returns empty arrays as the organization matching
  // logic is not yet implemented. The arrays below will be populated in a future
  // implementation when the repository queries are added.

  const allOrganisations = await organisationsRepository.findAll()

  // Get linked organisation details if a link exists
  const linkedOrg = allOrganisations.find(
    (org) => org.linkedDefraOrganisation?.orgId === defraIdOrgId
  )

  return linkedOrg
}
