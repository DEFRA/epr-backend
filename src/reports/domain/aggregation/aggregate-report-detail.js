import { formatDateISO } from '#common/helpers/date-formatter.js'
import { MONTHS_PER_PERIOD } from '../cadence.js'
import {
  SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY,
  TONNAGE_RECEIVED_FIELD_BY_OPERATOR_CATEGORY
} from './fields-by-operator-category.js'
import { filterRecordsByDateField } from './filter-records-by-date.js'
import { aggregateWasteReceived } from './aggregate-waste-received.js'
import { aggregateWasteExported } from './aggregate-waste-exported.js'
import { aggregateWasteSentOn } from './aggregate-waste-sent-on.js'

/**
 * @typedef {Object} AggregatedRecyclingActivity
 * @property {Array<{supplierName: string, facilityType: string, tonnageReceived: number, supplierAddress: string, supplierPhone: string|null, supplierEmail: string|null}>} suppliers
 * @property {number} totalTonnageReceived
 * @property {null} tonnageRecycled - Always null for computed reports (not yet entered)
 * @property {null} tonnageNotRecycled - Always null for computed reports (not yet entered)
 */

/**
 * @typedef {Object} AggregatedExportActivity
 * @property {Array<{orsId: string, siteName: string|null, country: string|null}>} overseasSites
 * @property {number} totalTonnageExported
 * @property {number} tonnageReceivedNotExported
 * @property {number} tonnageRefusedAtDestination
 * @property {number} tonnageStoppedDuringExport
 * @property {number} totalTonnageRefusedOrStopped
 * @property {number} tonnageRepatriated
 */

/**
 * @typedef {Object} AggregatedWasteSent
 * @property {number} tonnageSentToReprocessor
 * @property {number} tonnageSentToExporter
 * @property {number} tonnageSentToAnotherSite
 * @property {Array<{recipientName: string, facilityType: string, address: string, tonnageSentOn: number}>} finalDestinations
 */

/**
 * @typedef {Object} AggregatedReportDetail
 * @property {string} operatorCategory
 * @property {string} cadence
 * @property {number} year
 * @property {number} period
 * @property {string} startDate
 * @property {string} endDate
 * @property {string|null} lastUploadedAt
 * @property {AggregatedRecyclingActivity} recyclingActivity
 * @property {AggregatedExportActivity} [exportActivity]
 * @property {AggregatedWasteSent} wasteSent
 */

/**
 * Aggregates waste records into a report detail for a specific period.
 *
 * Pure function — no repository or infrastructure dependencies.
 *
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} wasteRecords
 * @param {object} options
 * @param {string} options.operatorCategory
 * @param {string} options.cadence - Cadence key ('monthly' or 'quarterly')
 * @param {number} options.year
 * @param {number} options.period
 * @returns {AggregatedReportDetail}
 */
export function aggregateReportDetail(
  wasteRecords,
  { operatorCategory, cadence, year, period, orsDetailsMap }
) {
  const monthsPerPeriod = MONTHS_PER_PERIOD[cadence]

  if (!monthsPerPeriod) {
    throw new TypeError(`Unknown cadence: ${cadence}`)
  }

  const startMonth = (period - 1) * monthsPerPeriod

  const startDate = formatDateISO(year, startMonth, 1)
  const endDate = formatDateISO(year, startMonth + monthsPerPeriod, 0)

  const sectionDateFields =
    SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY[operatorCategory]

  const wasteReceivedDateField = sectionDateFields.wasteReceived
  const wasteExportedDateField = sectionDateFields.wasteExported
  const wasteRepatriatedDateField = sectionDateFields.wasteRepatriated
  const wasteSentOnDateField = sectionDateFields.wasteSentOn

  const wasteReceivedRecords = filterRecordsByDateField(
    wasteRecords,
    wasteReceivedDateField,
    startDate,
    endDate
  )

  const wasteExportedRecords = filterRecordsByDateField(
    wasteRecords,
    wasteExportedDateField,
    startDate,
    endDate
  )

  const wasteRepatriatedRecords = filterRecordsByDateField(
    wasteRecords,
    wasteRepatriatedDateField,
    startDate,
    endDate
  )

  const wasteSentOnRecords = filterRecordsByDateField(
    wasteRecords,
    wasteSentOnDateField,
    startDate,
    endDate
  )

  const lastUploadedAt = findLastUploadedAt(wasteRecords)

  const tonnageReceivedField =
    TONNAGE_RECEIVED_FIELD_BY_OPERATOR_CATEGORY[operatorCategory]

  const recyclingActivity = aggregateWasteReceived(
    wasteReceivedRecords,
    tonnageReceivedField
  )

  return {
    operatorCategory,
    cadence,
    year,
    period,
    startDate,
    endDate,
    lastUploadedAt,
    recyclingActivity,
    ...(wasteExportedDateField && {
      exportActivity: aggregateWasteExported(
        wasteExportedRecords,
        wasteRepatriatedRecords,
        recyclingActivity.totalTonnageReceived,
        orsDetailsMap
      )
    }),
    wasteSent: aggregateWasteSentOn(wasteSentOnRecords)
  }
}

/**
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} wasteRecords
 * @returns {string | null}
 */
function findLastUploadedAt(wasteRecords) {
  let latest = null

  for (const wasteRecord of wasteRecords) {
    for (const wasteRecordVersion of wasteRecord.versions) {
      if (!latest || wasteRecordVersion.createdAt > latest) {
        latest = wasteRecordVersion.createdAt
      }
    }
  }

  return latest
}
