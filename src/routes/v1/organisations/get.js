import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { SCOPES } from '#common/helpers/auth/constants.js'

export const organisationsGetAllPath = '/v1/organisations'

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200
const MAX_SEARCH_LENGTH = 200

/**
 * Search criteria are bounded strings rather than numbers or object ids on
 * purpose: a mistyped or truncated identifier must return an empty result set,
 * not a validation error. Parsing happens in the repository, which turns an
 * unparseable value into zero results.
 */
const criterionSchema = () =>
  Joi.string().trim().allow('').max(MAX_SEARCH_LENGTH).optional()

const CRITERIA_KEYS = [
  'search',
  'orgId',
  'registrationId',
  'registrationNumber',
  'accreditationId',
  'accreditationNumber'
]

const querySchema = Joi.object({
  search: criterionSchema(),
  orgId: criterionSchema(),
  registrationId: criterionSchema(),
  registrationNumber: criterionSchema(),
  accreditationId: criterionSchema(),
  accreditationNumber: criterionSchema(),
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(MAX_PAGE_SIZE).optional()
}).unknown(false)

const isPaginatedRequest = (query) =>
  'page' in query ||
  'pageSize' in query ||
  CRITERIA_KEYS.some((key) => key in query)

export const organisationsGetAll = {
  method: 'GET',
  path: organisationsGetAllPath,
  options: {
    auth: getAuthConfig([SCOPES.organisationSearch]),
    tags: ['api', 'admin'],
    validate: {
      query: querySchema
    }
  },
  /**
   * The handler is declared against the scope-aware view and the query alone.
   * Naming the organisations repository here fails the blocking type check, so
   * an unshaped organisation document cannot reach the response.
   *
   * @param {{
   *   organisationsListView: import('#application/organisations/organisations-list-view.js').OrganisationsListView,
   *   query: {
   *     search?: string,
   *     orgId?: string,
   *     registrationId?: string,
   *     registrationNumber?: string,
   *     accreditationId?: string,
   *     accreditationNumber?: string,
   *     page?: number,
   *     pageSize?: number
   *   }
   * }} request
   * @param {import('#common/hapi-types.js').HapiResponseToolkit} h
   */
  handler: async ({ organisationsListView, query }, h) => {
    if (!isPaginatedRequest(query)) {
      const organisations = await organisationsListView.findAll()
      return h.response(organisations).code(StatusCodes.OK)
    }

    const result = await organisationsListView.find({
      search: query.search,
      orgId: query.orgId,
      registrationId: query.registrationId,
      registrationNumber: query.registrationNumber,
      accreditationId: query.accreditationId,
      accreditationNumber: query.accreditationNumber,
      page: query.page ?? DEFAULT_PAGE,
      pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE
    })

    return h.response(result).code(StatusCodes.OK)
  }
}
