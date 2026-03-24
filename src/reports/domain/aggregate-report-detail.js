import { formatDateISO } from '#common/helpers/date-formatter.js'
import { MONTHS_PER_PERIOD } from './cadence.js'
import {
  SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY,
  TONNAGE_RECEIVED_FIELD_BY_OPERATOR_CATEGORY
} from './fields-by-operator-category.js'

/**
 * @typedef {Object} AggregatedRecyclingActivity
 * @property {Array<{supplierName: string, facilityType: string, tonnageReceived: number}>} suppliers
 * @property {number} totalTonnageReceived
 * @property {null} tonnageRecycled - Always null for computed reports (not yet entered)
 * @property {null} tonnageNotRecycled - Always null for computed reports (not yet entered)
 */

/**
 * @typedef {Object} AggregatedExportActivity
 * @property {Array<{orsId: string, siteName: string|undefined}>} overseasSites
 * @property {number} totalTonnageReceivedForExporting
 * @property {null} tonnageReceivedNotExported
 * @property {null} tonnageRefusedAtRecepientDestination
 * @property {null} tonnageStoppedDuringExport
 * @property {null} tonnageRepatriated
 */

/**
 * @typedef {Object} AggregatedWasteSent
 * @property {number} tonnageSentToReprocessor
 * @property {number} tonnageSentToExporter
 * @property {number} tonnageSentToAnotherSite
 * @property {Array<{recipientName: string, facilityType: string, tonnageSentOn: number}>} finalDestinations
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
  { operatorCategory, cadence, year, period }
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

  const wasteSentOnRecords = filterRecordsByDateField(
    wasteRecords,
    wasteSentOnDateField,
    startDate,
    endDate
  )

  const lastUploadedAt = findLastUploadedAt(wasteRecords)

  const tonnageReceivedField =
    TONNAGE_RECEIVED_FIELD_BY_OPERATOR_CATEGORY[operatorCategory]

  const wasteReceived = aggregateWasteReceived(
    wasteReceivedRecords,
    tonnageReceivedField
  )
  const wasteExported = aggregateWasteExported(wasteExportedRecords)
  const wasteSentOn = aggregateWasteSentOn(wasteSentOnRecords)

  return {
    operatorCategory,
    cadence,
    year,
    period,
    startDate,
    endDate,
    lastUploadedAt,
    recyclingActivity: wasteReceived,
    ...(wasteExportedDateField && { exportActivity: wasteExported }),
    wasteSent: wasteSentOn
  }
}

/**
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} wasteRecords
 * @param {string | undefined} dateField
 * @param {string} startDate
 * @param {string} endDate
 */
function filterRecordsByDateField(wasteRecords, dateField, startDate, endDate) {
  if (!dateField) {
    return []
  }

  return wasteRecords.filter((wasteRecord) => {
    const dateValue = wasteRecord.data[dateField]

    if (typeof dateValue !== 'string') {
      return false
    }

    const date = dateValue.slice(0, 10)

    return (
      date.localeCompare(startDate) >= 0 && date.localeCompare(endDate) <= 0
    )
  })
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

/**
 * @param {number} value
 * @returns {number}
 */
function toFiniteNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

/**
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} wasteReceivedRecords
 * @param {string} tonnageField
 */
function aggregateWasteReceived(wasteReceivedRecords, tonnageField) {
  let totalTonnageReceived = 0
  const suppliers = []

  for (const { data } of wasteReceivedRecords) {
    const tonnageReceived = toFiniteNumber(data[tonnageField])

    totalTonnageReceived += tonnageReceived

    const supplierName = data.SUPPLIER_NAME
    const facilityType = data.ACTIVITIES_CARRIED_OUT_BY_SUPPLIER

    if (supplierName) {
      suppliers.push({ supplierName, facilityType, tonnageReceived })
    }
  }

  return {
    suppliers,
    totalTonnageReceived,
    tonnageRecycled: null,
    tonnageNotRecycled: null
  }
}

/**
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} wasteExportedRecords
 */
function aggregateWasteExported(wasteExportedRecords) {
  let totalTonnageReceivedForExporting = 0
  const seenOrsIds = new Set()
  const overseasSites = []

  for (const { data } of wasteExportedRecords) {
    const tonnage = toFiniteNumber(data.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED)

    totalTonnageReceivedForExporting += tonnage

    const orsId = data.OSR_ID
    const siteName = data.OSR_NAME

    if (orsId && !seenOrsIds.has(orsId)) {
      seenOrsIds.add(orsId)
      overseasSites.push({ orsId, siteName })
    }
  }

  return {
    overseasSites,
    totalTonnageReceivedForExporting,
    tonnageReceivedNotExported: null,
    tonnageRefusedAtRecepientDestination: null,
    tonnageStoppedDuringExport: null,
    tonnageRepatriated: null
  }
}

/**
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} wasteSentOnRecords
 */
function aggregateWasteSentOn(wasteSentOnRecords) {
  let tonnageSentToReprocessor = 0
  let tonnageSentToExporter = 0
  let tonnageSentToAnotherSite = 0
  const finalDestinations = []

  for (const { data } of wasteSentOnRecords) {
    const recipientName = data.FINAL_DESTINATION_NAME
    const facilityType = data.FINAL_DESTINATION_FACILITY_TYPE

    const tonnageSentOn = toFiniteNumber(
      data.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON
    )

    if (facilityType === 'Reprocessor') {
      tonnageSentToReprocessor += tonnageSentOn
    } else if (facilityType === 'Exporter') {
      tonnageSentToExporter += tonnageSentOn
    } else {
      tonnageSentToAnotherSite += tonnageSentOn
    }

    finalDestinations.push({ recipientName, facilityType, tonnageSentOn })
  }

  return {
    tonnageSentToReprocessor,
    tonnageSentToExporter,
    tonnageSentToAnotherSite,
    finalDestinations
  }
}
