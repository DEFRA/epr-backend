import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { getOperatorCategory } from '#reports/domain/operator-category.js'
import { aggregateReportDetail } from '#reports/domain/aggregate-report-detail.js'
import { generateReportingPeriods } from '#reports/domain/generate-reporting-periods.js'
import {
  periodParamsSchema,
  standardUserAuth,
  withRegistrationDetails,
  findCurrentReportId,
  extractChangedBy
} from './shared.js'

const FAR_FUTURE = new Date('2099-12-31')

/**
 * Resolves the tonnage-monitoring material from a registration.
 * Glass registrations use glassRecyclingProcess[0] (e.g. 'glass_re_melt').
 * All other materials map directly.
 * @param {object} registration
 * @returns {string}
 */
function resolveTonnageMaterial(registration) {
  if (
    registration.material === 'glass' &&
    registration.glassRecyclingProcess?.length > 0
  ) {
    return registration.glassRecyclingProcess[0]
  }
  return registration.material
}

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

export const reportsPostPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/reports/{year}/{cadence}/{period}'

export const reportsPost = {
  method: 'POST',
  path: reportsPostPath,
  options: {
    auth: standardUserAuth,
    tags: ['api'],
    validate: {
      params: periodParamsSchema
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

    if (findCurrentReportId(periodicReports, year, cadence, period)) {
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

    const changedBy = extractChangedBy(request.auth.credentials)

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
      .response(withRegistrationDetails(createdReport, registration))
      .code(StatusCodes.CREATED)
  }
}
