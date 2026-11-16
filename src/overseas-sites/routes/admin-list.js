/** @import { ExporterRegistration, Organisation, OverseasSite } from '#organisation-read-model/domain/model.js' */
import { toWireOrgId } from '#common/helpers/organisation-wire.js'
import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { currentUtcYear } from '#common/helpers/dates/year.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'

export const adminOverseasSitesListPath = '/v1/admin/overseas-sites'

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

const buildPaginationMetadata = ({ page, pageSize, totalItems }) => {
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize)
  const currentPage = totalPages === 0 ? DEFAULT_PAGE : page

  return {
    page: currentPage,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: totalPages > 0 && currentPage < totalPages,
    hasPreviousPage: totalPages > 0 && currentPage > 1
  }
}

const nullable = (value) => value ?? null

/**
 * @param {Organisation} organisation
 * @param {string} registrationNumber
 * @param {ExporterRegistration} registration
 * @param {string} orsId
 * @param {OverseasSite} site
 */
const toRow = (
  organisation,
  registrationNumber,
  registration,
  orsId,
  site
) => ({
  orgId: toWireOrgId(organisation.organisationNumber),
  registrationNumber,
  accreditationNumber: nullable(
    registration.accreditations[currentUtcYear()]?.accreditationNumber
  ),
  orsId,
  packagingWasteCategory: registration.material,
  destinationCountry: site.address.country,
  overseasReprocessorName: site.name,
  addressLine1: site.address.line1,
  addressLine2: nullable(site.address.line2),
  cityOrTown: site.address.townOrCity,
  stateProvinceOrRegion: nullable(site.address.stateOrRegion),
  postcode: nullable(site.address.postcode),
  coordinates: nullable(site.coordinates),
  validFrom: nullable(site.validFrom)
})

/**
 * @param {Organisation[]} organisations
 */
const buildRows = (organisations) =>
  organisations
    .flatMap((organisation) =>
      Object.entries(organisation.registrations).flatMap(
        ([registrationNumber, registration]) =>
          registration.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER
            ? Object.entries(registration.overseasSites).map(([orsId, site]) =>
                toRow(
                  organisation,
                  registrationNumber,
                  registration,
                  orsId,
                  site
                )
              )
            : []
      )
    )
    .sort((a, b) => a.orsId.localeCompare(b.orsId))

const buildAllPageSize = (rowCount) =>
  rowCount === 0 ? DEFAULT_PAGE_SIZE : rowCount

const normaliseRegistrationNumberFilter = (value) => {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

const filterRowsByRegistrationNumber = (rows, registrationNumber) => {
  if (!registrationNumber) {
    return rows
  }

  const normalisedFilter = registrationNumber.toLowerCase()

  return rows.filter((row) =>
    row.registrationNumber.toLowerCase().includes(normalisedFilter)
  )
}

export const adminOverseasSitesList = {
  method: 'GET',
  path: adminOverseasSitesListPath,
  options: {
    auth: getAuthConfig([SCOPES.adminRead]),
    tags: ['api'],
    validate: {
      query: Joi.object({
        all: Joi.boolean().optional(),
        page: Joi.number().integer().min(1).optional(),
        pageSize: Joi.number().integer().min(1).max(MAX_PAGE_SIZE).optional(),
        registrationNumber: Joi.string().trim().allow('').optional()
      })
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {
   *   organisationReadRepository: import('#organisation-read-model/repository/port.js').OrganisationReadRepository
   * }} request
   */
  handler: async (request, h) => {
    const { logger, organisationReadRepository } = request
    const all = Boolean(request.query.all)
    const page = Number(request.query.page ?? DEFAULT_PAGE)
    const pageSize = Number(request.query.pageSize ?? DEFAULT_PAGE_SIZE)
    const registrationNumber = normaliseRegistrationNumberFilter(
      request.query.registrationNumber
    )

    try {
      const organisations = await organisationReadRepository.findAll()

      const rows = filterRowsByRegistrationNumber(
        buildRows(organisations),
        registrationNumber
      )
      const startIndex = (page - 1) * pageSize

      const totalItems = rows.length
      const selectedRows = all
        ? rows
        : rows.slice(startIndex, startIndex + pageSize)
      const selectedPageSize = all ? buildAllPageSize(totalItems) : pageSize
      const pagination = buildPaginationMetadata({
        page: all ? DEFAULT_PAGE : page,
        pageSize: selectedPageSize,
        totalItems
      })

      logger.info({
        message: `Admin listed ${selectedRows.length} of ${totalItems} overseas sites mappings`,
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
