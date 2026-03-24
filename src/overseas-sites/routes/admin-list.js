import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'

/**
 * @typedef {import('#overseas-sites/repository/port.js').OverseasSite} OverseasSite
 */

export const adminOverseasSitesListPath = '/v1/admin/overseas-sites'

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

const buildPaginationMetadata = ({ page, pageSize, totalItems }) => {
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize)
  const effectivePage =
    totalPages === 0 ? DEFAULT_PAGE : Math.min(page, totalPages)

  return {
    page: effectivePage,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: totalPages > 0 && effectivePage < totalPages,
    hasPreviousPage: totalPages > 0 && effectivePage > 1
  }
}

/**
 * @param {Array<{orgId?: number, registrations?: Array<{material?: string, registrationNumber?: string, accreditationId?: string, accreditationNumber?: string, accreditation?: {accreditationNumber?: string}, overseasSites?: Record<string, {overseasSiteId: string}>}>, accreditations?: Array<{id?: string, accreditationNumber?: string}>}>} organisations
 * @param {Map<string, OverseasSite>} sitesById
 */
const buildRows = (organisations, sitesById) => {
  const registrationContexts = organisations.flatMap((organisation) =>
    (organisation.registrations ?? []).map((registration) => ({
      organisation,
      registration
    }))
  )

  const mappings = registrationContexts.flatMap(
    ({ organisation, registration }) =>
      Object.entries(registration.overseasSites ?? {}).map(
        ([orsId, mapping]) => ({
          organisation,
          registration,
          orsId,
          mapping
        })
      )
  )

  const rows = mappings
    .map(({ organisation, registration, orsId, mapping }) => {
      const site = sitesById.get(mapping.overseasSiteId)
      if (!site) {
        return null
      }

      const matchedAccreditation =
        organisation.accreditations?.find(
          (accreditation) => accreditation.id === registration.accreditationId
        ) ?? null

      const accreditationNumber =
        registration.accreditation?.accreditationNumber ??
        registration.accreditationNumber ??
        matchedAccreditation?.accreditationNumber ??
        null

      return {
        orsId,
        packagingWasteCategory: registration.material ?? null,
        orgId: organisation.orgId ?? null,
        registrationNumber: registration.registrationNumber ?? null,
        accreditationNumber,
        destinationCountry: site.country,
        overseasReprocessorName: site.name,
        addressLine1: site.address.line1,
        addressLine2: site.address.line2 ?? null,
        cityOrTown: site.address.townOrCity,
        stateProvinceOrRegion: site.address.stateOrRegion ?? null,
        postcode: site.address.postcode ?? null,
        coordinates: site.coordinates ?? null,
        validFrom: site.validFrom ?? null
      }
    })
    .filter((row) => row !== null)

  return rows.sort((a, b) => a.orsId.localeCompare(b.orsId))
}

export const adminOverseasSitesList = {
  method: 'GET',
  path: adminOverseasSitesListPath,
  options: {
    auth: getAuthConfig([ROLES.serviceMaintainer]),
    tags: ['api'],
    validate: {
      query: Joi.object({
        all: Joi.boolean().optional(),
        page: Joi.number().integer().min(1).optional(),
        pageSize: Joi.number().integer().min(1).max(MAX_PAGE_SIZE).optional()
      })
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {
   *   organisationsRepository: import('#repositories/organisations/port.js').OrganisationsRepository,
   *   overseasSitesRepository: import('#overseas-sites/repository/port.js').OverseasSitesRepository,
   * }} request
   */
  handler: async (request, h) => {
    const { logger, organisationsRepository, overseasSitesRepository } = request
    const all = String(request.query.all).toLowerCase() === 'true'
    const page = Number(request.query.page ?? DEFAULT_PAGE)
    const pageSize = Number(request.query.pageSize ?? DEFAULT_PAGE_SIZE)

    try {
      const [organisations, sites] = await Promise.all([
        organisationsRepository.findAll(),
        overseasSitesRepository.findAll()
      ])

      const sitesById = new Map(sites.map((site) => [site.id, site]))
      const rows = buildRows(organisations, sitesById)
      const selectedPageSize = all ? Math.max(rows.length, 1) : pageSize
      const pagination = buildPaginationMetadata({
        page: all ? DEFAULT_PAGE : page,
        pageSize: selectedPageSize,
        totalItems: rows.length
      })
      const startIndex = (pagination.page - 1) * pagination.pageSize
      const selectedRows = all
        ? rows
        : rows.slice(startIndex, startIndex + pagination.pageSize)

      logger.info({
        message: `Admin listed ${selectedRows.length} of ${rows.length} overseas sites mappings`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
        }
      })

      return h
        .response({
          rows: selectedRows,
          pagination
        })
        .code(StatusCodes.OK)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        err: error,
        message: `Failure on ${adminOverseasSitesListPath}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        }
      })

      throw Boom.badImplementation(`Failure on ${adminOverseasSitesListPath}`)
    }
  }
}
