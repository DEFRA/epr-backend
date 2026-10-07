import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { ORGANISATION_STATUSES } from '#organisation-read-model/domain/model.js'
import { toLinkedDefraOrganisation } from '#organisation-read-model/repository/adapter.js'
import {
  linkOrganisation,
  organisationsLink
} from '#routes/v1/organisations/link.js'
import {
  organisationsUserPut,
  putOrganisationUser
} from '#routes/v1/organisations/user/put.js'
import { atNaturalKeys, organisationIds } from './by-natural-key.js'
import { linkedDefraOrganisationViewSchema } from './response.schema.js'
import { organisationParams, organisationPath } from './view-route.js'

const linkedOrganisationSchema = Joi.object({
  status: Joi.string()
    .valid(...ORGANISATION_STATUSES)
    .required(),
  linkedDefraOrganisation: linkedDefraOrganisationViewSchema.required()
})

export const organisationLink = atNaturalKeys(
  {
    ...organisationsLink,
    options: {
      ...organisationsLink.options,
      tags: ['api'],
      response: {
        schema: linkedOrganisationSchema,
        modify: true,
        options: { stripUnknown: true }
      }
    },
    handler: linkOrganisation((status, linked) => ({
      status,
      linkedDefraOrganisation: toLinkedDefraOrganisation(linked)
    }))
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
