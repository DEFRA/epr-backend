import { USER_ROLES } from '#domain/organisations/model.js'

/** @import {DefraIdRelationship, DefraIdTokenPayload} from '../types.js' */
/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */

/**
 * Performs a case-insensitive string comparison
 * see: https://stackoverflow.com/a/2140723
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export const stringEquals = (a, b) =>
  a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0

/**
 * Checks if a user is the initial user of an organisation
 * @param {string} email - The user's email address
 * @param {Organisation} organisation - The organisation to check against
 * @returns {boolean} True if the user is an initial user of the organisation
 */
export const isInitialUser = (email, organisation) =>
  Boolean(
    organisation.users?.some(
      (user) =>
        stringEquals(user.email, email) &&
        user.roles?.includes(USER_ROLES.INITIAL)
    )
  )

/**
 * Extracts and parses organization data from a Defra ID token
 * @param {Pick<DefraIdTokenPayload, 'currentRelationshipId' | 'relationships'>} tokenPayload - The Defra ID token payload
 * @returns {DefraIdRelationship[]} Array of parsed relationship objects
 */
export function getOrgDataFromDefraIdToken(tokenPayload) {
  const { currentRelationshipId, relationships } = tokenPayload

  if (!relationships) {
    return []
  }

  return relationships.map((relationship) => {
    const [relationshipId, organisationId, organisationName] =
      relationship.split(':')

    return {
      defraIdOrgId: organisationId,
      defraIdOrgName: organisationName?.trim(),
      isCurrent:
        currentRelationshipId !== undefined &&
        stringEquals(currentRelationshipId, relationshipId)
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
 * @param {Pick<DefraIdTokenPayload, 'currentRelationshipId' | 'relationships'>} tokenPayload - The Defra ID token payload
 * @returns {{defraIdOrgId?: string, defraIdOrgName?: string, defraIdRelationships: DefraIdRelationship[]}} Summary object containing current org ID, name, and all relationships
 */
export function getDefraTokenSummary(tokenPayload) {
  const defraIdRelationships = getOrgDataFromDefraIdToken(tokenPayload)
  const { defraIdOrgId, defraIdOrgName } =
    getCurrentRelationship(defraIdRelationships) || {}

  return { defraIdOrgId, defraIdOrgName, defraIdRelationships }
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
