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

export async function findOrganisationMatches(
  email,
  defraIdOrgId,
  organisationsRepository
) {
  const linkedOrganisations =
    await organisationsRepository.findAllByDefraIdOrgId(defraIdOrgId)
  const unlinkedOrganisations =
    await organisationsRepository.findAllUnlinkedOrganisationsByUser({
      email,
      isInitialUser: true
    })

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
  return request.route.path === '/user-status' && request.method === 'get'
}
