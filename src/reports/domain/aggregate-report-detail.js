import { formatDateISO } from '#common/helpers/date-formatter.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { DATE_FIELDS_BY_OPERATOR_CATEGORY } from './date-fields-by-operator-category.js'

/**
 * Aggregates waste records into a report detail for a specific period.
 *
 * Pure function — no repository or infrastructure dependencies.
 *
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} wasteRecords
 * @param {object} options
 * @param {string} options.operatorCategory
 * @param {import('./cadence.js').MONTHLY | import('./cadence.js').QUARTERLY} options.cadence
 * @param {number} options.year
 * @param {number} options.period
 */
export function aggregateReportDetail(
  wasteRecords,
  { operatorCategory, cadence, year, period }
) {
  const startMonth = (period - 1) * cadence.monthsPerPeriod

  const startDate = formatDateISO(year, startMonth, 1)
  const endDate = formatDateISO(year, startMonth + cadence.monthsPerPeriod, 0)

  const operatorDateFields = DATE_FIELDS_BY_OPERATOR_CATEGORY[operatorCategory]

  const receivedDateFields = operatorDateFields[WASTE_RECORD_TYPE.RECEIVED]
  const sentOnDateFields = operatorDateFields[WASTE_RECORD_TYPE.SENT_ON]

  const wasteReceivedRecords = filterRecordsByPeriod(
    wasteRecords,
    receivedDateFields,
    startDate,
    endDate
  )

  const wasteSentOnRecords = filterRecordsByPeriod(
    wasteRecords,
    sentOnDateFields,
    startDate,
    endDate
  )

  return {
    operatorCategory,
    cadence: cadence.id,
    year,
    period,
    startDate,
    endDate,
    lastUploadedAt: findLastUploadedAt(wasteRecords),
    sections: {
      wasteReceived: aggregateWasteReceived(wasteReceivedRecords),
      wasteSentOn: aggregateWasteSentOn(wasteSentOnRecords)
    }
  }
}

/**
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} wasteRecords
 * @param {string[] | undefined} dateFields
 * @param {string} startDate
 * @param {string} endDate
 */
function filterRecordsByPeriod(wasteRecords, dateFields, startDate, endDate) {
  if (!dateFields) {
    return []
  }

  return wasteRecords.filter((wasteRecord) => {
    return dateFields.some((dateField) => {
      const dateValue = wasteRecord.data[dateField]

      if (typeof dateValue !== 'string') {
        return false
      }

      const dateOnly = dateValue.slice(0, 10)

      return dateOnly >= startDate && dateOnly <= endDate
    })
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
 */
function aggregateWasteReceived(wasteReceivedRecords) {
  let totalTonnage = 0
  const suppliers = []

  for (const wasteReceivedRecord of wasteReceivedRecords) {
    const tonnage = toFiniteNumber(
      wasteReceivedRecord.data.TONNAGE_RECEIVED_FOR_RECYCLING
    )

    totalTonnage += tonnage

    const supplier = {
      supplierName: wasteReceivedRecord.data.SUPPLIER_NAME,
      role: wasteReceivedRecord.data.ACTIVITIES_CARRIED_OUT_BY_SUPPLIER,
      tonnage
    }

    suppliers.push(supplier)
  }

  return { totalTonnage, suppliers }
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

  for (const wasteSentOnRecord of wasteSentOnRecords) {
    const tonnage = toFiniteNumber(
      wasteSentOnRecord.data.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON
    )

    const facilityType = wasteSentOnRecord.data.FINAL_DESTINATION_FACILITY_TYPE

    totalTonnage += tonnage

    if (facilityType === 'Reprocessor') {
      toReprocessors += tonnage
    } else if (facilityType === 'Exporter') {
      toExporters += tonnage
    } else {
      toOtherSites += tonnage
    }

    const destination = {
      recipientName: wasteSentOnRecord.data.FINAL_DESTINATION_NAME,
      role: facilityType,
      tonnage
    }

    destinations.push(destination)
  }

  return {
    totalTonnage,
    toReprocessors,
    toExporters,
    toOtherSites,
    destinations
  }
}
