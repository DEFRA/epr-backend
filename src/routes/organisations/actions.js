import { organisationsLink } from '#routes/v1/organisations/link.js'
import { organisationsUnlink } from '#routes/v1/organisations/unlink.js'
import { organisationsUserPut } from '#routes/v1/organisations/user/put.js'
import { atNaturalKeys } from './at-natural-keys.js'
import { organisationParams, organisationPath } from './view-route.js'

export const organisationLink = atNaturalKeys(
  organisationsLink,
  `${organisationPath}/link`,
  organisationParams
)

export const organisationUnlink = atNaturalKeys(
  organisationsUnlink,
  `${organisationPath}/link`,
  organisationParams
)

export const organisationUserPut = atNaturalKeys(
  organisationsUserPut,
  `${organisationPath}/user`,
  organisationParams
)
