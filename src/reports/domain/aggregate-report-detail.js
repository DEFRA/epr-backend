import { formatDateISO } from '#common/helpers/date-formatter.js'
import { MONTHS_PER_PERIOD } from './cadence.js'
import {
  SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY,
  TONNAGE_RECEIVED_FIELD_BY_OPERATOR_CATEGORY
} from './fields-by-operator-category.js'

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
    sections: {
      wasteReceived,
      ...(wasteExportedDateField && { wasteExported }),
      wasteSentOn
    }
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
  let totalTonnage = 0
  const suppliers = []

  for (const { data } of wasteReceivedRecords) {
    const tonnage = toFiniteNumber(data[tonnageField])

    totalTonnage += tonnage

    const supplierName = data.SUPPLIER_NAME
    const role = data.ACTIVITIES_CARRIED_OUT_BY_SUPPLIER

    if (supplierName) {
      suppliers.push({ supplierName, role, tonnage })
    }
  }

  return { totalTonnage, suppliers }
}

/**
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} wasteExportedRecords
 */
function aggregateWasteExported(wasteExportedRecords) {
  let totalTonnage = 0
  const seenOsrIds = new Set()
  const overseasSites = []

  for (const { data } of wasteExportedRecords) {
    const tonnage = toFiniteNumber(data.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED)

    totalTonnage += tonnage

    const osrId = data.OSR_ID
    const siteName = data.OSR_NAME

    if (osrId && !seenOsrIds.has(osrId)) {
      seenOsrIds.add(osrId)
      overseasSites.push({ osrId, siteName })
    }
  }

  return { totalTonnage, overseasSites }
}

/**
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} wasteSentOnRecords
 */
function aggregateWasteSentOn(wasteSentOnRecords) {
  let totalTonnage = 0
  let toReprocessors = 0
  let toExporters = 0
  let toOtherSites = 0
  const destinations = []

  for (const { data } of wasteSentOnRecords) {
    const recipientName = data.FINAL_DESTINATION_NAME
    const role = data.FINAL_DESTINATION_FACILITY_TYPE

    const tonnage = toFiniteNumber(data.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON)

    totalTonnage += tonnage

    if (role === 'Reprocessor') {
      toReprocessors += tonnage
    } else if (role === 'Exporter') {
      toExporters += tonnage
    } else {
      toOtherSites += tonnage
    }

    destinations.push({ recipientName, role, tonnage })
  }

  return {
    totalTonnage,
    toReprocessors,
    toExporters,
    toOtherSites,
    destinations
  }
}
