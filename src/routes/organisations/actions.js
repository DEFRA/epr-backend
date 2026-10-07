import { organisationsLink } from '#routes/v1/organisations/link.js'
import { organisationsUserPut } from '#routes/v1/organisations/user/put.js'
import { atNaturalKeys, organisationIds } from './by-natural-key.js'
import { organisationParams, organisationPath } from './view-route.js'

export const organisationLink = atNaturalKeys(
  organisationsLink,
  `${organisationPath}/link`,
  organisationParams,
  organisationIds
)

export const organisationUserPut = atNaturalKeys(
  organisationsUserPut,
  `${organisationPath}/user`,
  organisationParams,
  organisationIds
)
