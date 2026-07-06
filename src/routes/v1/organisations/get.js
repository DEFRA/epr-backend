import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { SCOPES } from '#common/helpers/auth/constants.js'

export const organisationsGetAllPath = '/v1/organisations'

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200
const MAX_SEARCH_LENGTH = 200

const querySchema = Joi.object({
  search: Joi.string().trim().allow('').max(MAX_SEARCH_LENGTH).optional(),
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(MAX_PAGE_SIZE).optional()
}).unknown(false)

const isPaginatedRequest = (query) =>
  'search' in query || 'page' in query || 'pageSize' in query

export const organisationsGetAll = {
  method: 'GET',
  path: organisationsGetAllPath,
  options: {
    auth: getAuthConfig([SCOPES.adminRead]),
    tags: ['api', 'admin'],
    validate: {
      query: querySchema
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {
   *   query: { search?: string, page?: number, pageSize?: number }
   * }} request
   * @param {import('#common/hapi-types.js').HapiResponseToolkit} h
   */
  handler: async ({ organisationsRepository, query }, h) => {
    if (!isPaginatedRequest(query)) {
      const organisations = await organisationsRepository.findAll()
      return h.response(organisations).code(StatusCodes.OK)
    }

    const result = await organisationsRepository.findPage({
      search: query.search,
      page: query.page ?? DEFAULT_PAGE,
      pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE
    })

    return h.response(result).code(StatusCodes.OK)
  }
}
