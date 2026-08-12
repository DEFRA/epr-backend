import { toNumber } from '#common/helpers/decimal-utils.js'
import {
  ZERO_TONNAGE,
  addTonnage,
  toRoundedTonnage
} from '#common/helpers/rounded-tonnage.js'
import { groupAndSum } from './helpers.js'
import { isYes } from '#domain/summary-logs/table-schemas/shared/yes-no.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { isDateInRange } from './filter-records-by-date.js'
import { isOrsApprovedAtDate } from '#overseas-sites/domain/approval.js'
import { OPERATOR_CATEGORY } from '../operator-category.js'

/**
 * @import { AggregatedExportActivity, ReportableWasteRecordState } from './aggregate-report-detail.js'
 * @import { CalendarDate } from '#common/helpers/date-formatter.js'
 * @import { OrsDetails } from '#overseas-sites/application/get-ors-details-map.js'
 * @import { ExporterCategory } from '../operator-category.js'
 * @import { RECEIVED_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/exporter/fields.js'
 * @import { LOADS_EXPORTED_FIELDS } from '#domain/summary-logs/table-schemas/exporter-registered-only/fields.js'
 * @import { RoundedTonnage } from '#common/helpers/rounded-tonnage.js'
 */

/**
 * Both templates: an accredited exporter reports its exports on
 * RECEIVED_LOADS_FOR_EXPORT, a registered-only one on LOADS_EXPORTED.
 *
 * @typedef {Partial<Record<keyof typeof RECEIVED_LOADS_FIELDS | keyof typeof LOADS_EXPORTED_FIELDS, unknown>> & {
 *   DATE_OF_EXPORT?: string,
 *   TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED?: number,
 *   WAS_THE_WASTE_REFUSED?: string,
 *   WAS_THE_WASTE_STOPPED?: string
 * }} ExportedRowData
 */

/**
 * @typedef {Omit<ReportableWasteRecordState, 'data'> & { data: ExportedRowData }} ExportedWasteRecordState
 */

const ORS_ID_DIGITS = 3
const ZERO = '0'

const zeroPadOrsId = (orsId) => String(orsId).padStart(ORS_ID_DIGITS, ZERO)

/**
 * @typedef {{ record: ExportedWasteRecordState, orsId: string, details: OrsDetails | undefined }} OrsEntry
 */

/**
 * A site the ORS import resolved to a name, so its details can be reported.
 *
 * @param {OrsEntry} entry
 * @returns {entry is OrsEntry & { details: OrsDetails & { siteName: string } }}
 */
const isResolvedSite = (entry) => Boolean(entry.details?.siteName)

/**
 * @template {{ tonnageDecimal: RoundedTonnage }} G
 * @param {G[]} grouped
 * @returns {Array<Omit<G, 'tonnageDecimal'> & { tonnageExported: number }>}
 */
const summariseTonnage = (grouped) =>
  grouped.map(({ tonnageDecimal, ...rest }) => ({
    ...rest,
    tonnageExported: toNumber(tonnageDecimal)
  }))

/**
 * @param {ExportedWasteRecordState[]} wasteExportedRecords
 * @param {Map<string, OrsDetails>} orsDetailsMap
 * @param {ExporterCategory} operatorCategory
 * @returns {Pick<AggregatedExportActivity, 'overseasSites' | 'unapprovedOverseasSites'>}
 */
const generateOverseasSiteSummaries = (
  wasteExportedRecords,
  orsDetailsMap,
  operatorCategory
) => {
  // OSR_ID is wrongly named, it should be ORS_ID but its a significant amount of work to correct that.
  const entries = wasteExportedRecords
    .filter(({ data }) => data.OSR_ID)
    .map((record) => {
      const orsId = zeroPadOrsId(record.data.OSR_ID)
      return { record, orsId, details: orsDetailsMap.get(orsId) }
    })

  const isApproved = ({ record, details }) => {
    if (operatorCategory === OPERATOR_CATEGORY.EXPORTER_REGISTERED_ONLY) {
      return false
    }
    return isOrsApprovedAtDate(details?.validFrom, record.data.DATE_OF_EXPORT)
  }

  const getTonnage = ({ record }) =>
    toRoundedTonnage(record.data.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED)

  const overseasSites = summariseTonnage(
    groupAndSum(
      entries.filter(isResolvedSite),
      (entry) => `${entry.orsId}:${isApproved(entry)}`,
      (entry) => ({
        orsId: entry.orsId,
        siteName: entry.details.siteName,
        country: entry.details.country,
        approved: isApproved(entry)
      }),
      getTonnage
    )
  )

  const unapprovedOverseasSites = summariseTonnage(
    groupAndSum(
      entries.filter((entry) => !isResolvedSite(entry)),
      (entry) => entry.orsId,
      (entry) => ({ orsId: entry.orsId }),
      getTonnage
    )
  )

  return { overseasSites, unapprovedOverseasSites }
}

/**
 * Sum the exported tonnage across records repatriated in the reporting period.
 *
 * @param {ExportedWasteRecordState[]} repatriatedRecords
 * @returns {number}
 */
function getTonnageRepatriated(repatriatedRecords) {
  return toNumber(
    repatriatedRecords
      .filter(
        ({ wasteRecordType }) => wasteRecordType === WASTE_RECORD_TYPE.EXPORTED
      )
      .reduce(
        (sum, { data }) =>
          addTonnage(
            sum,
            toRoundedTonnage(data.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED)
          ),
        ZERO_TONNAGE
      )
  )
}

/**
 * Only the EXPORTER template: registered-only reports its exports on a separate
 * table and never reaches this calculation.
 *
 * @typedef {Partial<Record<keyof typeof RECEIVED_LOADS_FIELDS, unknown>> & {
 *   DATE_OF_EXPORT?: string,
 *   TONNAGE_RECEIVED_FOR_EXPORT?: number
 * }} ReceivedForExportRowData
 */

/**
 * @typedef {Omit<ReportableWasteRecordState, 'data'> & { data: ReceivedForExportRowData }} ReceivedForExportRecordState
 */

/**
 * Sum the tonnage received for export whose export date falls outside the
 * reporting period.
 *
 * @param {ReceivedForExportRecordState[]} wasteReceivedRecords
 * @param {CalendarDate} startDate
 * @param {CalendarDate} endDate
 * @returns {number}
 */
function calculateTonnageReceivedNotExported(
  wasteReceivedRecords,
  startDate,
  endDate
) {
  return toNumber(
    wasteReceivedRecords
      .filter(
        ({ data }) => !isDateInRange(data.DATE_OF_EXPORT, startDate, endDate)
      )
      .reduce(
        (sum, { data }) =>
          addTonnage(sum, toRoundedTonnage(data.TONNAGE_RECEIVED_FOR_EXPORT)),
        ZERO_TONNAGE
      )
  )
}

/**
 * Sum refused, stopped, and refused-or-stopped export tonnages. The row
 * tonnages are pre-rounded 2dp row-state values, so the sums are exact.
 *
 * @param {ExportedWasteRecordState[]} exportedRecords
 * @returns {{ tonnageRefusedAtDestination: number, tonnageStoppedDuringExport: number, totalTonnageRefusedOrStopped: number }}
 */
function calculateRefusedAndStoppedTonnages(exportedRecords) {
  const { refusedDecimal, stoppedDecimal, refusedOrStoppedDecimal } =
    exportedRecords.reduce(
      (acc, { data }) => {
        const tonnage = toRoundedTonnage(
          data.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED
        )
        const refused = isYes(data.WAS_THE_WASTE_REFUSED)
        const stopped = isYes(data.WAS_THE_WASTE_STOPPED)
        return {
          refusedDecimal: refused
            ? addTonnage(acc.refusedDecimal, tonnage)
            : acc.refusedDecimal,
          stoppedDecimal: stopped
            ? addTonnage(acc.stoppedDecimal, tonnage)
            : acc.stoppedDecimal,
          refusedOrStoppedDecimal:
            refused || stopped
              ? addTonnage(acc.refusedOrStoppedDecimal, tonnage)
              : acc.refusedOrStoppedDecimal
        }
      },
      {
        refusedDecimal: ZERO_TONNAGE,
        stoppedDecimal: ZERO_TONNAGE,
        refusedOrStoppedDecimal: ZERO_TONNAGE
      }
    )

  return {
    tonnageRefusedAtDestination: toNumber(refusedDecimal),
    tonnageStoppedDuringExport: toNumber(stoppedDecimal),
    totalTonnageRefusedOrStopped: toNumber(refusedOrStoppedDecimal)
  }
}

/**
 * @param {object} params
 * @param {ReportableWasteRecordState[]} params.wasteExportedRecords
 * @param {ReportableWasteRecordState[]} params.repatriatedRecords
 * @param {ReportableWasteRecordState[]} params.wasteReceivedRecords
 * @param {CalendarDate} params.startDate
 * @param {CalendarDate} params.endDate
 * @param {Map<string, OrsDetails>} [params.orsDetailsMap]
 * @param {ExporterCategory} params.operatorCategory
 * @returns {AggregatedExportActivity}
 */
export function aggregateWasteExported({
  wasteExportedRecords,
  repatriatedRecords,
  wasteReceivedRecords,
  startDate,
  endDate,
  orsDetailsMap = new Map(),
  operatorCategory
}) {
  const exportedRecords = wasteExportedRecords.filter(
    ({ wasteRecordType }) => wasteRecordType === WASTE_RECORD_TYPE.EXPORTED
  )

  const totalTonnageExportedDecimal = exportedRecords.reduce(
    (sum, { data }) =>
      addTonnage(
        sum,
        toRoundedTonnage(data.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED)
      ),
    ZERO_TONNAGE
  )
  const totalTonnageExported = toNumber(totalTonnageExportedDecimal)
  const {
    tonnageRefusedAtDestination,
    tonnageStoppedDuringExport,
    totalTonnageRefusedOrStopped
  } = calculateRefusedAndStoppedTonnages(exportedRecords)

  const { overseasSites, unapprovedOverseasSites } =
    generateOverseasSiteSummaries(
      exportedRecords,
      orsDetailsMap,
      operatorCategory
    )

  return {
    overseasSites,
    unapprovedOverseasSites,
    totalTonnageExported,
    tonnageReceivedNotExported:
      operatorCategory === OPERATOR_CATEGORY.EXPORTER_REGISTERED_ONLY
        ? null
        : calculateTonnageReceivedNotExported(
            wasteReceivedRecords,
            startDate,
            endDate
          ),
    tonnageRefusedAtDestination,
    tonnageStoppedDuringExport,
    totalTonnageRefusedOrStopped,
    tonnageRepatriated: getTonnageRepatriated(repatriatedRecords)
  }
}
