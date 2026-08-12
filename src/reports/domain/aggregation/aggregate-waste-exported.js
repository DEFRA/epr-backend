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
 * @import { OrsDetails } from '#overseas-sites/application/get-ors-details-map.js'
 */

const ORS_ID_DIGITS = 3
const ZERO = '0'

const zeroPadOrsId = (orsId) => String(orsId).padStart(ORS_ID_DIGITS, ZERO)

const summariseTonnage = (grouped) =>
  grouped.map(({ tonnageDecimal, ...rest }) => ({
    ...rest,
    tonnageExported: toNumber(tonnageDecimal)
  }))

/**
 * @param {ReportableWasteRecordState[]} wasteExportedRecords
 * @param {Map<string, OrsDetails>} orsDetailsMap
 * @param {string} operatorCategory
 * @returns {Pick<AggregatedExportActivity, 'overseasSites' | 'unapprovedOverseasSites'>}
 */
const generateOverseasSiteSummaries = (
  wasteExportedRecords,
  orsDetailsMap,
  operatorCategory
) => {
  // OSR_ID is wrongly named, it should be ORS_ID but its a significant amount of work to correct that.
  const recordsWithOrsId = wasteExportedRecords.filter(
    ({ data }) => data.OSR_ID
  )

  const isResolvedSite = ({ data }) => {
    const details = orsDetailsMap.get(zeroPadOrsId(data.OSR_ID))
    return Boolean(details?.siteName)
  }

  const isApproved = ({ data }) => {
    if (operatorCategory === OPERATOR_CATEGORY.EXPORTER_REGISTERED_ONLY) {
      return false
    }
    const details = orsDetailsMap.get(zeroPadOrsId(data.OSR_ID))
    return isOrsApprovedAtDate(details?.validFrom, data.DATE_OF_EXPORT)
  }

  const getTonnage = ({ data }) =>
    toRoundedTonnage(data.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED)

  const overseasSites = summariseTonnage(
    groupAndSum(
      recordsWithOrsId.filter(isResolvedSite),
      ({ data }) => {
        const approved = isApproved({ data })
        return `${zeroPadOrsId(data.OSR_ID)}:${approved}`
      },
      ({ data }) => {
        const orsId = zeroPadOrsId(data.OSR_ID)
        const details = orsDetailsMap.get(orsId)
        return {
          orsId,
          siteName: details?.siteName,
          country: details?.country,
          approved: isApproved({ data })
        }
      },
      getTonnage
    )
  )

  const unapprovedOverseasSites = summariseTonnage(
    groupAndSum(
      recordsWithOrsId.filter((record) => !isResolvedSite(record)),
      ({ data }) => zeroPadOrsId(data.OSR_ID),
      ({ data }) => ({ orsId: zeroPadOrsId(data.OSR_ID) }),
      getTonnage
    )
  )

  return { overseasSites, unapprovedOverseasSites }
}

/**
 * Sum the exported tonnage across records repatriated in the reporting period.
 *
 * @param {ReportableWasteRecordState[]} repatriatedRecords
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
 * Sum the tonnage received for export whose export date falls outside the
 * reporting period.
 *
 * @param {ReportableWasteRecordState[]} wasteReceivedRecords
 * @param {string} startDate - ISO date string (YYYY-MM-DD)
 * @param {string} endDate - ISO date string (YYYY-MM-DD)
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
 * @param {ReportableWasteRecordState[]} exportedRecords
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
 * @param {string} params.startDate - ISO date string (YYYY-MM-DD)
 * @param {string} params.endDate - ISO date string (YYYY-MM-DD)
 * @param {Map<string, OrsDetails>} [params.orsDetailsMap]
 * @param {string} params.operatorCategory
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
