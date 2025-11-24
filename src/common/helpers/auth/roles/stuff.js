import { STATUS } from '#domain/organisations/model.js'
import { organisationsLinkPath } from '#domain/organisations/paths.js'
import {
  isInitialUser,
  isLinkedUser
} from '#common/helpers/auth/roles/helpers.js'
const { organisationsRepository, params = {} } = request
const { organisationId } = params

// Request is for a specific organisation
if (organisationId) {
  request.logger.info({ organisationId }, 'defra-id: has organisationId')

  const organisationById =
    await organisationsRepository.findById(organisationId)
  const isInitial = isInitialUser(organisationById, email)

  if (request.route.path === organisationsLinkPath && isInitial) {
    // Linking organisation is allowed because a known user is requesting to link it
    request.logger.info(organisationById, 'defra-id: approve organisation')

    request.server.app.organisationId = organisationId

    return { scope: ['user_can_link_organisation'] }
  }

  // Organisation has a status allowing it to be accessed
  if ([STATUS.ACTIVE, STATUS.SUSPENDED].includes(organisationById.status)) {
    const isOrgMatch = organisationById.defraIdOrgId === defraIdOrgId
    const isLinked = isLinkedUser(organisationById, defraIdOrgId)
    const isAuthorised = isOrgMatch && isLinked
    const shouldAddUser = isLinked && !isInitial

    request.logger.info(
      {
        isAuthorised,
        shouldAddUser
      },
      'defra-id: organisation is active or suspended'
    )

    if (shouldAddUser) {
      await organisationsRepository.update(
        organisationById.id,
        organisationById.version,
        {
          users: [
            ...organisationById.users,
            {
              email,
              fullName: `${tokenPayload.firstName} ${tokenPayload.lastName}`,
              isInitialUser: false,
              roles: [ROLES.standardUser]
            }
          ]
        }
      )
    }

    return {
      scope: isAuthorised ? [ROLES.standardUser] : []
    }
  }
}
//
//
//
//
// Current Organisation in token not linked or the organisation requested does not match the current Organisation in the token
if (
  !currentLinkedOrganisation ||
  (organisationId && currentLinkedOrganisation.id !== organisationId)
) {
  const message = 'No linked organisation found'
  request.logger.warn(
    {
      currentLinkedOrganisation,
      unlinkedOrganisations: organisations.unlinked
    },
    `defra-id: ${message}`
  )
  const isCurrentOrganisationLinked = !!currentLinkedOrganisation

  return {
    scope: [],
    response: h
      .response({
        action: 'link-organisations',
        defraId: {
          userId: tokenPayload.id,
          orgName: defraIdOrgName,
          otherRelationships: defraIdRelationships.filter(
            ({ isCurrent }) => !isCurrent
          )
        },
        isCurrentOrganisationLinked,
        message,
        organisationId,
        organisations: hasUnlinkedOrganisations
          ? getOrganisationsSummary(organisations.unlinked)
          : []
      })
      .code(StatusCodes.PARTIAL_CONTENT)
  }
}
