import { badRequest, conflict } from '#common/helpers/enrich-boom.js'
import { getOrsDetailsMap } from '#overseas-sites/application/get-ors-details-map.js'
import { getIssuedTonnage } from '#packaging-recycling-notes/application/get-issued-tonnage.js'
import { aggregateReportDetail } from '#reports/domain/aggregation/aggregate-report-detail.js'
import { generateAllPeriodsForYear } from '#reports/domain/generate-reporting-periods.js'
import { getOperatorCategory } from '#reports/domain/operator-category.js'
import { errorCodes } from '#reports/enums/error-codes.js'

/**
 * @import { PeriodicReport } from '#reports/repository/port.js'
 */

/**
 * Finds the current report ID for a specific period slot within periodic reports.
 * @param {import('#reports/repository/port.js').PeriodicReport[]} periodicReports
 * @param {number} year
 * @param {string} cadence
 * @param {number} period
 * @returns {string|null}
 */
function findCurrentReportId(periodicReports, year, cadence, period) {
  const slot = periodicReports.find((pr) => pr.year === year)?.reports?.[
    cadence
  ]?.[period]
  return slot?.current?.id ?? slot?.previousSubmissions?.[0]?.id ?? null
}

/**
 * Looks up the stored report for a period, if one exists.
 * @param {import('#reports/repository/port.js').ReportsRepository} reportsRepository
 * @param {string} organisationId
 * @param {string} registrationId
 * @param {number} year
 * @param {string} cadence
 * @param {number} period
 * @returns {Promise<import('#reports/repository/port.js').Report | null>}
 */
export async function fetchCurrentReport(
  reportsRepository,
  organisationId,
  registrationId,
  year,
  cadence,
  period
) {
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

  if (!currentReportId) {
    return null
  }

  return reportsRepository.findReportById(currentReportId)
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
 * @typedef {{ period: number, startDate: string, endDate: string, dueDate: string }} PeriodInfo
 */

/**
 * Throws a 400 Boom with `output.payload.invalidPeriod` if the period isn't
 * in the cadence's valid range for the year.
 *
 * @param {number} period
 * @param {string} cadence
 * @param {PeriodInfo[]} allPeriods
 * @returns {PeriodInfo}
 */
const assertValidPeriod = (period, cadence, allPeriods) => {
  const periodInfo = allPeriods.find((p) => p.period === period)
  if (!periodInfo) {
    const validPeriods = allPeriods.map((p) => p.period)
    throw badRequest(
      `Invalid period ${period} for cadence ${cadence}`,
      errorCodes.invalidPeriod,
      {
        event: {
          action: 'create_report',
          reason: `actual=${period} cadence=${cadence} validPeriods=[${validPeriods.join(',')}]`
        },
        payload: { invalidPeriod: { actual: period, cadence, validPeriods } }
      }
    )
  }
  return periodInfo
}

/**
 * Throws a 400 Boom with `output.payload.periodNotEnded` if the period's
 * end date has not yet passed.
 *
 * @param {PeriodInfo} periodInfo
 * @param {number} period
 * @param {string} cadence
 * @returns {void}
 */
const assertPeriodEnded = (periodInfo, period, cadence) => {
  const dayAfterEnd = new Date(periodInfo.endDate)
  dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1)
  if (dayAfterEnd > new Date()) {
    const earliestSubmissionDate = dayAfterEnd.toISOString()
    throw badRequest(
      `Cannot create report for period ${period} — period has not yet ended`,
      errorCodes.periodNotEnded,
      {
        event: {
          action: 'create_report',
          reason: `period=${period} cadence=${cadence} endDate=${periodInfo.endDate} earliestSubmissionDate=${earliestSubmissionDate}`
        },
        payload: {
          periodNotEnded: {
            period,
            cadence,
            endDate: periodInfo.endDate,
            earliestSubmissionDate
          }
        }
      }
    )
  }
}

/**
 * Throws a 409 Boom with `output.payload.existingReport` if a report for the
 * same period already exists.
 *
 * @param {PeriodicReport[]} periodicReports
 * @param {number} year
 * @param {string} cadence
 * @param {number} period
 * @returns {void}
 */
const assertNoExistingReport = (periodicReports, year, cadence, period) => {
  const id = findCurrentReportId(periodicReports, year, cadence, period)
  if (id) {
    throw conflict(
      `Report already exists for ${cadence} period ${period} of ${year}`,
      errorCodes.reportAlreadyExists,
      {
        event: {
          action: 'create_report',
          reason: `cadence=${cadence} period=${period} year=${year}`,
          reference: id
        },
        payload: { existingReport: { id, cadence, period, year } }
      }
    )
  }
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
  const periodInfo = assertValidPeriod(period, cadence, allPeriods)
  assertPeriodEnded(periodInfo, period, cadence)
  return periodInfo
}

/**
 * Extracts the report-specific fields from aggregated data and registration.
 * @param {import('#reports/domain/aggregation/aggregate-report-detail.js').AggregatedReportDetail & { prn?: { issuedTonnage: number } | null }} aggregated
 * @param {object} registration
 * @returns {object}
 */
function buildReportData(aggregated, registration) {
  const { recyclingActivity, exportActivity, wasteSent, prn, source } =
    aggregated
  return {
    material: resolveTonnageMaterial(registration),
    wasteProcessingType: registration.wasteProcessingType,
    siteAddress: formatSiteAddress(registration.site?.address),
    source,
    recyclingActivity,
    prn,
    ...(exportActivity && { exportActivity }),
    wasteSent
  }
}

/**
 * Finds the report for a given period with PRN tonnage. Returns the stored
 * report if one exists, otherwise computes one from waste records.
 *
 * @param {object} params
 * @param {import('#reports/repository/port.js').ReportsRepository} params.reportsRepository
 * @param {object} params.wasteRecordsRepository
 * @param {object} params.packagingRecyclingNotesRepository
 * @param {import('#overseas-sites/repository/port.js').OverseasSitesRepository} params.overseasSitesRepository
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {object} params.registration
 * @param {number} params.year
 * @param {string} params.cadence
 * @param {number} params.period
 * @returns {Promise<import('#reports/repository/port.js').Report | import('#reports/domain/aggregation/aggregate-report-detail.js').AggregatedReportDetail>}
 */
export async function fetchOrGenerateReportForPeriod({
  reportsRepository,
  wasteRecordsRepository,
  packagingRecyclingNotesRepository,
  overseasSitesRepository,
  organisationId,
  registrationId,
  registration,
  year,
  cadence,
  period
}) {
  const storedReport = await fetchCurrentReport(
    reportsRepository,
    organisationId,
    registrationId,
    year,
    cadence,
    period
  )

  if (storedReport) {
    return storedReport
  }

  const operatorCategory = getOperatorCategory(registration)
  const wasteRecords = await wasteRecordsRepository.findByRegistration(
    organisationId,
    registrationId
  )

  return getAggregatedReportDetail({
    packagingRecyclingNotesRepository,
    overseasSitesRepository,
    wasteRecords,
    operatorCategory,
    registration,
    year,
    cadence,
    period
  })
}

/**
 * Aggregates waste records into a report and appends issued PRN tonnage.
 * @param {object} params
 * @param {object} params.packagingRecyclingNotesRepository
 * @param {import('#overseas-sites/repository/port.js').OverseasSitesRepository} params.overseasSitesRepository
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} params.wasteRecords
 * @param {string} params.operatorCategory
 * @param {object} params.registration
 * @param {number} params.year
 * @param {string} params.cadence
 * @param {number} params.period
 * @returns {Promise<import('#reports/domain/aggregation/aggregate-report-detail.js').AggregatedReportDetail & { prn: { issuedTonnage: number } | null }>}
 */
async function getAggregatedReportDetail({
  packagingRecyclingNotesRepository,
  overseasSitesRepository,
  wasteRecords,
  operatorCategory,
  registration,
  year,
  cadence,
  period
}) {
  const orsDetailsMap = await getOrsDetailsMap(
    overseasSitesRepository,
    registration.overseasSites
  )

  const aggregatedReportDetail = aggregateReportDetail(wasteRecords, {
    operatorCategory,
    cadence,
    year,
    period,
    orsDetailsMap
  })

  const prn = await getIssuedTonnage(packagingRecyclingNotesRepository, {
    accreditationId: registration.accreditationId,
    startDate: aggregatedReportDetail.startDate,
    endDate: aggregatedReportDetail.endDate
  })

  return { ...aggregatedReportDetail, prn }
}

/**
 * Creates a report for a given period. Validates the period has ended,
 * checks no report already exists, aggregates waste data, and persists.
 *
 * @param {object} params
 * @param {import('#reports/repository/port.js').ReportsRepository} params.reportsRepository
 * @param {object} params.wasteRecordsRepository
 * @param {object} params.packagingRecyclingNotesRepository
 * @param {import('#overseas-sites/repository/port.js').OverseasSitesRepository} params.overseasSitesRepository
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
  packagingRecyclingNotesRepository,
  overseasSitesRepository,
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

  assertNoExistingReport(periodicReports, year, cadence, period)

  const operatorCategory = getOperatorCategory(registration)
  const wasteRecords = await wasteRecordsRepository.findByRegistration(
    organisationId,
    registrationId
  )

  const aggregatedReportData = await getAggregatedReportDetail({
    packagingRecyclingNotesRepository,
    overseasSitesRepository,
    wasteRecords,
    operatorCategory,
    registration,
    year,
    cadence,
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
    ...buildReportData(aggregatedReportData, registration)
  })
}
