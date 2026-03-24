import Boom from '@hapi/boom'

import { getOperatorCategory } from '#reports/domain/operator-category.js'
import { aggregateReportDetail } from '#reports/domain/aggregate-report-detail.js'
import { generateAllPeriodsForYear } from '#reports/domain/generate-reporting-periods.js'

/**
 * Finds the current report ID for a specific period slot within periodic reports.
 * @param {import('#reports/repository/port.js').PeriodicReport[]} periodicReports
 * @param {number} year
 * @param {string} cadence
 * @param {number} period
 * @returns {string|null}
 */
function findCurrentReportId(periodicReports, year, cadence, period) {
  const periodicReport = periodicReports.find((pr) => pr.year === year)
  return periodicReport?.reports?.[cadence]?.[period]?.currentReportId ?? null
}

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
 * Validates that a period exists for the given cadence and has ended.
 * @param {string} cadence
 * @param {number} year
 * @param {number} period
 * @returns {{ startDate: string, endDate: string, dueDate: string }}
 */
function getValidatedPeriodInfo(cadence, year, period) {
  const allPeriods = generateAllPeriodsForYear(cadence, year)
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
 * Extracts the report-specific fields from aggregated data and registration.
 * @param {import('#reports/domain/aggregate-report-detail.js').AggregatedReportDetail} aggregated
 * @param {object} registration
 * @returns {object}
 */
function buildReportData(aggregated, registration) {
  const { recyclingActivity, exportActivity, wasteSent } = aggregated
  return {
    material: resolveTonnageMaterial(registration),
    wasteProcessingType: registration.wasteProcessingType,
    siteAddress: formatSiteAddress(registration.site?.address),
    recyclingActivity,
    ...(exportActivity && { exportActivity }),
    wasteSent
  }
}

/**
 * Finds the report for a given period. Returns the stored report if one exists,
 * otherwise computes one from waste records.
 *
 * @param {object} params
 * @param {import('#reports/repository/port.js').ReportsRepository} params.reportsRepository
 * @param {object} params.wasteRecordsRepository
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {object} params.registration
 * @param {number} params.year
 * @param {string} params.cadence
 * @param {number} params.period
 * @returns {Promise<{ report: import('#reports/repository/port.js').Report | import('#reports/domain/aggregate-report-detail.js').AggregatedReportDetail }>}
 */
export async function findReportForPeriod({
  reportsRepository,
  wasteRecordsRepository,
  organisationId,
  registrationId,
  registration,
  year,
  cadence,
  period
}) {
  const periodicReports = await reportsRepository.findPeriodicReports({
    organisationId,
    registrationId
  })

  const currentReportId = findCurrentReportId(
    periodicReports,
    year,
    cadence,
    period
  )

  if (currentReportId) {
    const storedReport = await reportsRepository.findReportById(currentReportId)
    return { report: storedReport }
  }

  const operatorCategory = getOperatorCategory(registration)
  const wasteRecords = await wasteRecordsRepository.findByRegistration(
    organisationId,
    registrationId
  )

  const report = aggregateReportDetail(wasteRecords, {
    operatorCategory,
    cadence,
    year,
    period
  })

  return { report }
}

/**
 * Creates a report for a given period. Validates the period has ended,
 * checks no report already exists, aggregates waste data, and persists.
 *
 * @param {object} params
 * @param {import('#reports/repository/port.js').ReportsRepository} params.reportsRepository
 * @param {object} params.wasteRecordsRepository
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {object} params.registration
 * @param {number} params.year
 * @param {string} params.cadence
 * @param {number} params.period
 * @param {import('#reports/repository/port.js').UserSummary} params.changedBy
 * @returns {Promise<import('#reports/repository/port.js').Report>}
 */
export async function createReportForPeriod({
  reportsRepository,
  wasteRecordsRepository,
  organisationId,
  registrationId,
  registration,
  year,
  cadence,
  period,
  changedBy
}) {
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

  return reportsRepository.createReport({
    organisationId,
    registrationId,
    year,
    cadence,
    period,
    startDate,
    endDate,
    dueDate,
    changedBy,
    ...buildReportData(aggregated, registration)
  })
}
