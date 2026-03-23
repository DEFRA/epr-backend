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
  if (!address) {
    return undefined
  }
  return [address.line1, address.line2, address.town, address.postcode]
    .filter(Boolean)
    .join(', ')
}

/**
 * Validates and returns the period info, checking it exists and has ended.
 * @param {string} cadence
 * @param {number} year
 * @param {number} period
 * @returns {{ startDate: string, endDate: string, dueDate: string }}
 */
function getValidatedPeriodInfo(cadence, year, period) {
  const allPeriods = generateReportingPeriods(cadence, year, FAR_FUTURE)
  const periodInfo = allPeriods.find((p) => p.period === period)

  if (!periodInfo) {
    throw Boom.badRequest(`Invalid period ${period} for cadence ${cadence}`)
  }

  const dayAfterEnd = new Date(periodInfo.endDate)
  dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1)
  if (dayAfterEnd > new Date()) {
    throw Boom.badRequest(
      `Cannot create report for period ${period} — period has not yet ended`
    )
  }

  return periodInfo
}

/**
 * Maps aggregated sections to the createReport params shape.
 * @param {object} aggregated - Result from aggregateReportDetail
 * @param {object} registration
 * @returns {object}
 */
function buildReportData(aggregated, registration) {
  return {
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
      tonnageSentToReprocessor: aggregated.sections.wasteSentOn.toReprocessors,
      tonnageSentToExporter: aggregated.sections.wasteSentOn.toExporters,
      tonnageSentToAnotherSite: aggregated.sections.wasteSentOn.toOtherSites,
      finalDestinations: aggregated.sections.wasteSentOn.destinations
    }
  }
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

    const { startDate, endDate, dueDate } = getValidatedPeriodInfo(
      cadence,
      year,
      period
    )

    const periodicReports = await reportsRepository.findPeriodicReports({
      organisationId,
      registrationId
    })

    if (findCurrentReportId(periodicReports, year, cadence, period)) {
      throw Boom.conflict(
        `Report already exists for ${cadence} period ${period} of ${year}`
      )
    }

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

    const reportId = await reportsRepository.createReport({
      organisationId,
      registrationId,
      year,
      cadence,
      period,
      startDate,
      endDate,
      dueDate,
      changedBy: extractChangedBy(request.auth.credentials),
      ...buildReportData(aggregated, registration)
    })

    const createdReport = await reportsRepository.findReportById(reportId)

    return h
      .response(withRegistrationDetails(createdReport, registration))
      .code(StatusCodes.CREATED)
  }
}
