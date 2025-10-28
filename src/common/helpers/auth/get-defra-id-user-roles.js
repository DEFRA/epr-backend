import { STATUS } from '#domain/organisations/model.js'
import { ROLES } from '#common/helpers/auth/constants.js'
import { organisationsLinkPath } from '#domain/organisations/paths.js'
import { StatusCodes } from 'http-status-codes'

function getCurrentRelationship(relationships) {
  return relationships.find(({ isCurrent }) => isCurrent)
}

async function findOrganisationMatches(email, defraIdOrgId, request) {
  const { organisationsRepository } = request
  let linkedOrganisations
  let unlinkedOrganisations

  try {
    unlinkedOrganisations =
      await organisationsRepository.findAllUnlinkedOrganisationsByUser({
        email,
        isInitialUser: true
      })
    linkedOrganisations =
      await organisationsRepository.findAllByDefraIdOrgId(defraIdOrgId)
  } catch (error) {
    linkedOrganisations = []
    unlinkedOrganisations = []

    request.logger.error(error, 'defra-id: failed to find Organisation matches')
  }

  request.logger.info(
    {
      unlinkedOrganisations,
      linkedOrganisations,
      defraIdOrgId
    },
    'defra-id: organisation matches found'
  )

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

function isLinkedUser(organisation, defraIdOrgId) {
  return organisation.defraIdOrgId === defraIdOrgId
}

function isInitialUser(organisation, email) {
  return !!organisation.users.find(
    (user) => user.email === email && !!user.isInitialUser
  )
}

function getOrgDataFromToken(tokenPayload) {
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

function getOrganisationsSummary(organisations) {
  return organisations.map(({ orgId, id, companyDetails }) => ({
    id,
    orgId,
    name: companyDetails.name,
    tradingName: companyDetails.tradingName
  }))
}

export async function getDefraIdUserRoles(tokenPayload, request, h) {
  const { email } = tokenPayload
  const { organisationsRepository, params = {} } = request
  const { organisationId } = params

  try {
    const defraIdRelationships = getOrgDataFromToken(tokenPayload)
    const { defraIdOrgId, defraIdOrgName } =
      getCurrentRelationship(defraIdRelationships) || {}

    request.logger.info(
      { tokenPayload, params, defraIdOrgId, defraIdOrgName },
      'defra-id: validateRequest'
    )

    // No defraIdOrgId to link
    if (!defraIdOrgId) {
      request.logger.warn('defra-id: defraIdOrgId not found in token')

      return { scope: [] }
    }

    request.server.app.defraIdOrgId = defraIdOrgId
    request.server.app.defraIdOrgName = defraIdOrgName

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
