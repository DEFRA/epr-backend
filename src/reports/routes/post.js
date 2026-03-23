import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { getOperatorCategory } from '#reports/domain/operator-category.js'
import { aggregateReportDetail } from '#reports/domain/aggregate-report-detail.js'
import { generateReportingPeriods } from '#reports/domain/generate-reporting-periods.js'
import { cadenceSchema, periodSchema } from '#reports/repository/schema.js'

const MIN_YEAR = 2024
const MAX_YEAR = 2100
const FAR_FUTURE = new Date('2099-12-31')

/**
 * Resolves the tonnage-monitoring material from a registration.
 * Glass registrations use glassRecyclingProcess[0] (e.g. 'glass_re_melt').
 * All other materials map directly.
 * @param {object} registration
 * @returns {string}
 */
/**
 * Formats a site address object into a single-line string.
 * @param {object|undefined} address
 * @returns {string|undefined}
 */
function formatSiteAddress(address) {
  if (!address) return undefined
  return [address.line1, address.line2, address.town, address.postcode]
    .filter(Boolean)
    .join(', ')
}

function resolveTonnageMaterial(registration) {
  if (
    registration.material === 'glass' &&
    registration.glassRecyclingProcess?.length > 0
  ) {
    return registration.glassRecyclingProcess[0]
  }
  return registration.material
}

export const reportsPostPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/reports/{year}/{cadence}/{period}'

export const reportsPost = {
  method: 'POST',
  path: reportsPostPath,
  options: {
    auth: getAuthConfig([ROLES.standardUser]),
    tags: ['api'],
    validate: {
      params: Joi.object({
        organisationId: Joi.string().required(),
        registrationId: Joi.string().required(),
        year: Joi.number().integer().min(MIN_YEAR).max(MAX_YEAR).required(),
        cadence: cadenceSchema,
        period: periodSchema
      })
    }
  },
  handler: async (request, h) => {
    const {
      organisationsRepository,
      wasteRecordsRepository,
      reportsRepository,
      params
    } = request
    const { organisationId, registrationId, year, cadence, period } = params

    const registration = await organisationsRepository.findRegistrationById(
      organisationId,
      registrationId
    )

    // Compute period dates
    const allPeriods = generateReportingPeriods(cadence, year, FAR_FUTURE)
    const periodInfo = allPeriods.find((p) => p.period === period)

    if (!periodInfo) {
      throw Boom.badRequest(`Invalid period ${period} for cadence ${cadence}`)
    }

    const { startDate, endDate, dueDate } = periodInfo

    // ADR 0028 Rule 3: period must have ended before a report can be created
    const dayAfterEnd = new Date(endDate)
    dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1)
    if (dayAfterEnd > new Date()) {
      throw Boom.badRequest(
        `Cannot create report for period ${period} — period has not yet ended`
      )
    }

    // Check if a report already exists for this slot
    const periodicReports = await reportsRepository.findPeriodicReports({
      organisationId,
      registrationId
    })

    const periodicReport = periodicReports.find((pr) => pr.year === year)
    const slot = periodicReport?.reports?.[cadence]?.[period]

    if (slot?.currentReportId) {
      throw Boom.conflict(
        `Report already exists for ${cadence} period ${period} of ${year}`
      )
    }

    // Generate the aggregated data
    const operatorCategory = getOperatorCategory(registration)
    const wasteRecords = await wasteRecordsRepository.findByRegistration(
      organisationId,
      registrationId
    )

    const aggregated = aggregateReportDetail(wasteRecords, {
      operatorCategory,
      cadence,
      year,
      period
    })

    const changedBy = {
      id: request.auth.credentials.id,
      name: request.auth.credentials.name ?? request.auth.credentials.email,
      position: request.auth.credentials.position ?? 'User'
    }

    // Persist the report
    const reportId = await reportsRepository.createReport({
      organisationId,
      registrationId,
      year,
      cadence,
      period,
      startDate,
      endDate,
      dueDate,
      changedBy,
      material: resolveTonnageMaterial(registration),
      wasteProcessingType: registration.wasteProcessingType,
      siteAddress: formatSiteAddress(registration.site?.address),
      recyclingActivity: {
        suppliers: aggregated.sections.wasteReceived.suppliers,
        totalTonnageReceived: aggregated.sections.wasteReceived.totalTonnage,
        tonnageRecycled: 0,
        tonnageNotRecycled: 0
      },
      exportActivity: aggregated.sections.wasteExported
        ? {
            overseasSites: aggregated.sections.wasteExported.overseasSites,
            totalTonnageReceivedForExporting:
              aggregated.sections.wasteExported.totalTonnage,
            tonnageReceivedNotExported: 0
          }
        : undefined,
      wasteSent: {
        tonnageSentToReprocessor:
          aggregated.sections.wasteSentOn.toReprocessors,
        tonnageSentToExporter: aggregated.sections.wasteSentOn.toExporters,
        tonnageSentToAnotherSite: aggregated.sections.wasteSentOn.toOtherSites,
        finalDestinations: aggregated.sections.wasteSentOn.destinations
      }
    })

    const createdReport = await reportsRepository.findReportById(reportId)

    return h
      .response({
        ...createdReport,
        details: {
          material: registration.material,
          site: registration.site
        }
      })
      .code(StatusCodes.CREATED)
  }
}
