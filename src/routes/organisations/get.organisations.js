import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { ORGANISATION_NUMBER_PATTERN } from '#domain/organisations/numbers.js'
import { organisationListResponseSchema } from './response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/repository/port.js' */

const DEFAULT_PAGE_SIZE = 50
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
  organisationNumber: criterion(),
  registrationNumber: criterion(),
  accreditationNumber: criterion(),
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number()
    .integer()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
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
    const { organisationNumber } = query
    // A mistyped number finds nothing rather than failing the search
    const page =
      organisationNumber &&
      !ORGANISATION_NUMBER_PATTERN.test(organisationNumber)
        ? {
            items: [],
            page: query.page,
            pageSize: query.pageSize,
            totalItems: 0,
            totalPages: 0
          }
        : await organisationReadRepository.find(query)
    return h.response(page).code(StatusCodes.OK)
  }
}
