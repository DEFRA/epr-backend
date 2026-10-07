import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import {
  linkOrganisation,
  organisationsLink
} from '#routes/v1/organisations/link.js'
import {
  organisationsUserPut,
  putOrganisationUser
} from '#routes/v1/organisations/user/put.js'
import { atNaturalKeys, organisationIds } from './by-natural-key.js'
import { organisationParams, organisationPath } from './view-route.js'

/**
 * @import { RespondToLink } from '#routes/v1/organisations/link.js'
 *
 * @typedef {{
 *   status: string,
 *   linkedDefraOrganisation: {
 *     defraOrganisation: { id: string, name: string },
 *     linkedAt: string,
 *     linkedBy: { email: string }
 *   }
 * }} LinkedOrganisation
 */

const linkedOrganisationSchema = Joi.object({
  status: Joi.string().required(),
  linkedDefraOrganisation: Joi.object({
    defraOrganisation: Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required()
    }).required(),
    linkedAt: Joi.string().isoDate().required(),
    linkedBy: Joi.object({ email: Joi.string().required() }).required()
  }).required()
})

/** @type {RespondToLink} */
const toLinkedOrganisation = (status, linked) => {
  /** @type {LinkedOrganisation} */
  const body = {
    status,
    linkedDefraOrganisation: {
      defraOrganisation: { id: linked.orgId, name: linked.orgName },
      linkedAt: linked.linkedAt,
      linkedBy: { email: linked.linkedBy.email }
    }
  }
  return body
}

export const organisationLink = atNaturalKeys(
  {
    ...organisationsLink,
    options: {
      ...organisationsLink.options,
      response: { schema: linkedOrganisationSchema }
    },
    handler: linkOrganisation(toLinkedOrganisation)
  },
  `${organisationPath}/link`,
  organisationParams,
  organisationIds
)

export const organisationUserPut = atNaturalKeys(
  {
    ...organisationsUserPut,
    options: { ...organisationsUserPut.options, response: { schema: false } },
    handler: putOrganisationUser(StatusCodes.NO_CONTENT)
  },
  `${organisationPath}/user`,
  organisationParams,
  organisationIds
)
