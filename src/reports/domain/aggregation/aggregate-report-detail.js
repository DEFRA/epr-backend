import { formatDateISO } from '#common/helpers/date-formatter.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { MONTHS_PER_PERIOD } from '../cadence.js'
import { isExporterCategory } from '../operator-category.js'
import { aggregateWasteExported } from './aggregate-waste-exported.js'
import { aggregateWasteReceived } from './aggregate-waste-received.js'
import { aggregateWasteSentOn } from './aggregate-waste-sent-on.js'
import { coerceWasteRecordsForRead } from './coerce-waste-record.js'
import {
  SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY,
  TONNAGE_RECEIVED_FIELD_BY_OPERATOR_CATEGORY
} from './fields-by-operator-category.js'
import { filterRecordsByDateField } from './filter-records-by-date.js'

/**
 * @import { OrsDetails } from '#overseas-sites/application/get-ors-details-map.js'
 * @import { CalendarDate } from '#common/helpers/date-formatter.js'
 * @import { Cadence } from '../cadence.js'
 * @import { OperatorCategory } from '../operator-category.js'
 * @import { ExporterSectionDateFields, SectionDateFields } from './fields-by-operator-category.js'
 */

/**
 * The slice of a waste-record state the report aggregation reads: the row's
 * type and its coerced data. Narrower than the full `WasteRecordState` so the
 * type doesn't demand fields (classification, row identity) the aggregation
 * never consumes.
 *
 * @typedef {Pick<import('#waste-records/application/read-summary-log-row-states.js').WasteRecordState, 'wasteRecordType' | 'data'>} ReportableWasteRecordState
 */

/**
 * @typedef {{
 *   facilityType: string,
 *   supplierAddress: string|null,
 *   supplierEmail: string|null,
 *   supplierName: string,
 *   supplierPhone: string|null,
 *   tonnageReceived: number
 * }} Supplier
 */

/**
 * @typedef {{
 *   address: string|null,
 *   facilityType: string,
 *   recipientName: string,
 *   tonnageSentOn: number
 * }} FinalDestination
 */

/**
 * @typedef {Object} AggregatedRecyclingActivity
 * @property {Supplier[]} suppliers
 * @property {number} totalTonnageReceived
 * @property {null} tonnageRecycled - Always null for computed reports (not yet entered)
 * @property {null} tonnageNotRecycled - Always null for computed reports (not yet entered)
 */

/**
 * @typedef {Object} AggregatedExportActivity
 * @property {Array<{orsId: string, siteName: string, country: string|null, tonnageExported: number, approved: boolean}>} overseasSites
 * @property {Array<{orsId: string, tonnageExported: number}>} unapprovedOverseasSites
 * @property {number} totalTonnageExported
 * @property {number|null} tonnageReceivedNotExported
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
 * @property {FinalDestination[]} finalDestinations
 */

/**
 * @typedef {Object} AggregatedReportDetail
 * @property {OperatorCategory} operatorCategory
 * @property {Cadence} cadence
 * @property {number} year
 * @property {number} period
 * @property {CalendarDate} startDate
 * @property {CalendarDate} endDate
 * @property {{ summaryLogId: string|null, lastUploadedAt: string|null }} source
 * @property {AggregatedRecyclingActivity} recyclingActivity
 * @property {AggregatedExportActivity} [exportActivity]
 * @property {AggregatedWasteSent} wasteSent
 * @property {{ wasteReceivedRecordsExcluded: number }} diagnostics
 */

/**
 * Aggregates a registration's waste-record states into a report detail for a
 * specific period.
 *
 * Pure function — no repository or infrastructure dependencies. The source
 * metadata (which submission produced the current state, and when it was
 * submitted) is resolved by the caller from the latest submitted summary log
 * and passed in.
 *
 * @param {ReportableWasteRecordState[]} wasteRecordStates
 * @param {object} options
 * @param {OperatorCategory} options.operatorCategory
 * @param {Cadence} options.cadence
 * @param {number} options.year
 * @param {number} options.period
 * @param {{ summaryLogId: string|null, lastUploadedAt: string|null }} options.source
 * @param {Map<string, OrsDetails>} [options.orsDetailsMap]
 * @returns {AggregatedReportDetail}
 */
export function aggregateReportDetail(
  wasteRecordStates,
  { operatorCategory, cadence, year, period, source, orsDetailsMap }
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

  const coercedRecords = coerceWasteRecordsForRead(wasteRecordStates)

  const {
    wasteReceivedRecords,
    wasteExportedRecords,
    wasteRepatriatedRecords,
    wasteSentOnRecords
  } = sliceRecordsByPeriod(
    coercedRecords,
    sectionDateFields,
    startDate,
    endDate
  )

  const tonnageReceivedField =
    TONNAGE_RECEIVED_FIELD_BY_OPERATOR_CATEGORY[operatorCategory]

  const recyclingActivity = aggregateWasteReceived(
    wasteReceivedRecords,
    tonnageReceivedField
  )

  // Count received records excluded because they lack the expected date field.
  // This could potentially happen after a registered-only organisation becomes
  // accredited (or vice versa): historical registered-only records have MONTH_RECEIVED_FOR_*
  // but the accredited category looks up DATE_RECEIVED_FOR_*. See ADR 0030,
  // Finding 3. Only wasteReceived needs this check — all other sections use
  // the same date field name regardless of operator category.
  const wasteReceivedRecordsExcluded = coercedRecords.filter(
    (r) =>
      r.wasteRecordType === WASTE_RECORD_TYPE.RECEIVED &&
      wasteReceivedDateField &&
      (r.data[wasteReceivedDateField] === null ||
        r.data[wasteReceivedDateField] === undefined)
  ).length

  return {
    operatorCategory,
    cadence,
    year,
    period,
    startDate,
    endDate,
    source,
    recyclingActivity,
    ...(isExporterCategory(operatorCategory) && {
      exportActivity: aggregateWasteExported({
        wasteExportedRecords,
        repatriatedRecords: wasteRepatriatedRecords,
        wasteReceivedRecords,
        startDate,
        endDate,
        orsDetailsMap,
        operatorCategory
      })
    }),
    wasteSent: aggregateWasteSentOn(wasteSentOnRecords),
    diagnostics: { wasteReceivedRecordsExcluded }
  }
}

/**
 * Slices waste-record states into per-section record sets, each filtered to
 * those whose section date field falls within [startDate, endDate].
 *
 * @param {ReportableWasteRecordState[]} wasteRecords
 * @param {SectionDateFields} sectionDateFields
 * @param {CalendarDate} startDate
 * @param {CalendarDate} endDate
 */
function sliceRecordsByPeriod(
  wasteRecords,
  sectionDateFields,
  startDate,
  endDate
) {
  /** @type {Partial<ExporterSectionDateFields>} */
  const { wasteExported, wasteRepatriated } = sectionDateFields

  return {
    wasteReceivedRecords: filterRecordsByDateField(
      wasteRecords,
      sectionDateFields.wasteReceived,
      startDate,
      endDate
    ),
    wasteExportedRecords: filterRecordsByDateField(
      wasteRecords,
      wasteExported,
      startDate,
      endDate
    ),
    wasteRepatriatedRecords: filterRecordsByDateField(
      wasteRecords,
      wasteRepatriated,
      startDate,
      endDate
    ),
    wasteSentOnRecords: filterRecordsByDateField(
      wasteRecords,
      sectionDateFields.wasteSentOn,
      startDate,
      endDate
    )
  }
}
