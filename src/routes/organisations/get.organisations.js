import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { ORGANISATION_NUMBER_PATTERN } from '#domain/organisations/numbers.js'
import { organisationListResponseSchema } from './response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/repository/port.js' */

const MAX_PAGE_SIZE = 200
const MAX_SEARCH_LENGTH = 200

const criterion = () =>
  Joi.string().trim().allow('').max(MAX_SEARCH_LENGTH).optional()

/**
 * @typedef {{
 *   search?: string
 *   organisationNumber?: string
 *   registrationNumber?: string
 *   accreditationNumber?: string
 *   page: number
 *   pageSize: number
 * }} OrganisationListQuery
 */

const querySchema = Joi.object({
  search: criterion(),
  organisationNumber: Joi.string()
    .trim()
    .allow('')
    .pattern(ORGANISATION_NUMBER_PATTERN)
    .optional(),
  registrationNumber: criterion(),
  accreditationNumber: criterion(),
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(MAX_PAGE_SIZE).default(50)
})

export const organisationListGet = {
  method: 'GET',
  path: '/organisations',
  options: {
    auth: { scope: [SCOPES.organisationSearch] },
    tags: ['api'],
    validate: { query: querySchema },
    response: {
      schema: organisationListResponseSchema,
      modify: true,
      options: { stripUnknown: true }
    }
  },
  /**
   * @param {HapiRequest & {
   *   organisationReadRepository: OrganisationReadRepository,
   *   query: OrganisationListQuery
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async ({ organisationReadRepository, query }, h) => {
    const { organisationNumber, ...criteria } = query
    const page = await organisationReadRepository.find({
      ...criteria,
      orgId: organisationNumber
    })
    return h.response(page).code(StatusCodes.OK)
  }
}
