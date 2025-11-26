import { organisationsDiscoveryPath } from '#domain/organisations/paths.js'

export function isLinkedUser(organisation, defraIdOrgId) {
  return organisation.defraIdOrgId === defraIdOrgId
}

export function isInitialUser(organisation, email) {
  return !!organisation.users.find(
    (user) => user.email === email && !!user.isInitialUser
  )
}

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

export function getOrganisationsSummary(organisations) {
  return organisations.map(({ orgId, id, companyDetails }) => ({
    id,
    orgId,
    name: companyDetails.name,
    tradingName: companyDetails.tradingName
  }))
}

export function getCurrentRelationship(relationships) {
  return relationships.find(({ isCurrent }) => isCurrent)
}

export function getDefraTokenSummary(tokenPayload) {
  const defraIdRelationships = getOrgDataFromDefraIdToken(tokenPayload)
  const { defraIdOrgId, defraIdOrgName } =
    getCurrentRelationship(defraIdRelationships) || {}

  return { defraIdOrgId, defraIdOrgName, defraIdRelationships }
}

export function isOrganisationsDiscoveryReq(request) {
  return (
    request.route.path === organisationsDiscoveryPath &&
    request.method === 'get'
  )
}
