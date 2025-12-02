import { ROLES } from '#common/helpers/auth/constants.js'

export const addUserIfNotInitial = async (request, organisationById) => {
  const { organisationsRepository } = request

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
