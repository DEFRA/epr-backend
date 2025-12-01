export async function getDefraIdUserRoles(tokenPayload, request, h) {
  const { email } = tokenPayload
  const { organisationsRepository, params = {} } = request
  const { organisationId } = params

  try {
    // If the token is a DefraId token
    // And the currentRelationship in the token matches one (and only one) EPR organisation via `defraIdOrgId`
    // If an `organisationId` parameter can be extracted from the url
    // And the organisationId matches the organisation assigned to the currentRelationship
    // And the url is not the /link url
    // And the status of the organisation is Active or Suspended
    // Then the user is assigned a role of "standardUser"
    // And they must be added to the organisation list of users (if not already present)

    // Request is for a specific organisation
    if (organisationId) {
      request.logger.info({ organisationId }, 'defra-id: has organisationId')

      // Organisation has a status allowing it to be accessed
      if ([STATUS.ACTIVE, STATUS.SUSPENDED].includes(organisationById.status)) {
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

    const organisations = await findOrganisationMatches(
      email,
      defraIdOrgId,
      request
    )

    const hasUnlinkedOrganisations = organisations.unlinked.length > 0
    const currentLinkedOrganisation = organisations.linked.find(
      (organisation) => defraIdOrgId === organisation.defraIdOrgId
    )

    // Organisation requested does not match the organisations the user is associated with
    if (
      organisationId &&
      !organisations.all.find(({ id }) => id === organisationId)
    ) {
      request.logger.warn(
        { organisationId, organisations: organisations.all },
        'defra-id: user is not associated with this organisation'
      )

      return { scope: [] }
    }

    // Current Organisation in token not linked or the organisation requested does not match the current Organisation in the token
    if (
      hasUnlinkedOrganisations &&
      (!currentLinkedOrganisation ||
        (organisationId && currentLinkedOrganisation.id !== organisationId))
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

    if (currentLinkedOrganisation) {
      request.logger.info(
        { currentLinkedOrganisation },
        'defra-id: user is authorised for currentLinkedOrganisation'
      )

      return { scope: [ROLES.standardUser] }
    }

    // Organisation requested does not match the organisation the user is associated with
    if (organisationId && organisationId !== currentLinkedOrganisation.id) {
      request.logger.warn(
        { currentLinkedOrganisation, organisationId },
        'defra-id: organisation requested does not match the organisation the user is associated with'
      )

      return { scope: [] }
    }

    request.logger.warn('defra-id: organisation could not be matched for user')

    return { scope: [] }
  } catch (error) {
    request.logger.error(error, 'defra-id: failed to validate request')
  }
}
