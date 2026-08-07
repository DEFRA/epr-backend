import { greaterThan, toNumber } from '#common/helpers/decimal-utils.js'
import { isNil } from '#common/helpers/is-nil.js'
import {
  ZERO_TONNAGE,
  addTonnage,
  subtractTonnage,
  toRoundedTonnage
} from '#common/helpers/rounded-tonnage.js'
import { groupAndSum } from './helpers.js'
import { isYes } from '#domain/summary-logs/table-schemas/shared/yes-no.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { isOrsApprovedAtDate } from '#overseas-sites/domain/approval.js'
import { OPERATOR_CATEGORY } from '../operator-category.js'

/**
 * @import { RoundedTonnage } from '#common/helpers/rounded-tonnage.js'
 * @import { ReportableWasteRecordState } from './aggregate-report-detail.js'
 */

const ORS_ID_DIGITS = 3
const ZERO = '0'

const zeroPadOrsId = (orsId) => String(orsId).padStart(ORS_ID_DIGITS, ZERO)

const summariseTonnage = (grouped) =>
  grouped.map(({ tonnageDecimal, ...rest }) => ({
    ...rest,
    tonnageExported: toNumber(tonnageDecimal)
  }))

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
          siteName: details.siteName,
          country: details.country,
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
 * Whether a load claims to have exported more than it received. Physically
 * impossible, so it marks a data error rather than a quantity.
 *
 * A load with no received tonnage recorded is excluded: every field on the
 * received-loads table is optional, so a blank reads as zero and would
 * otherwise present as an over-export. That is a different defect with a
 * different remedy, and folding the two together would misreport both.
 *
 * @param {Record<string, any>} data
 * @returns {boolean}
 */
function isOverExported(data) {
  return (
    !isNil(data.TONNAGE_RECEIVED_FOR_EXPORT) &&
    greaterThan(
      toRoundedTonnage(data.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED),
      toRoundedTonnage(data.TONNAGE_RECEIVED_FOR_EXPORT)
    )
  )
}

/**
 * How many loads received in the period were clamped by
 * {@link tonnageStillOnSite}. The clamp discards tonnage silently, and how such
 * a row should be handled is still open with the business, so the count is
 * carried as a diagnostic rather than left invisible.
 *
 * @param {ReportableWasteRecordState[]} wasteReceivedRecords
 * @returns {number}
 */
export function countOverExportedLoads(wasteReceivedRecords) {
  return wasteReceivedRecords.filter(({ data }) => isOverExported(data)).length
}

/**
 * A load's contribution to "packaging waste received but not exported": the
 * tonnage received for export less the tonnage actually exported, with a blank
 * exported tonnage read as zero. Clamped at zero for a row exporting more than
 * it received, or with no received tonnage recorded at all — neither is waste
 * owed back.
 *
 * @param {Record<string, any>} data
 * @returns {RoundedTonnage}
 */
function tonnageStillOnSite(data) {
  const received = toRoundedTonnage(data.TONNAGE_RECEIVED_FOR_EXPORT)
  const exported = toRoundedTonnage(data.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED)
  return greaterThan(received, exported)
    ? subtractTonnage(received, exported)
    : ZERO_TONNAGE
}

/**
 * Total tonnage received in the period that has not been exported, summed per
 * load. A load counts on its exported tonnage alone: an export date without an
 * exported tonnage means the waste is still on site, so the date plays no part.
 *
 * @param {ReportableWasteRecordState[]} wasteReceivedRecords
 * @returns {number}
 */
function calculateTonnageReceivedNotExported(wasteReceivedRecords) {
  return toNumber(
    wasteReceivedRecords.reduce(
      (sum, { data }) => addTonnage(sum, tonnageStillOnSite(data)),
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
 * @param {Map<string, { siteName: string|null, country: string|null, validFrom: Date|null }>} [params.orsDetailsMap]
 * @param {string} params.operatorCategory
 */
export function aggregateWasteExported({
  wasteExportedRecords,
  repatriatedRecords,
  wasteReceivedRecords,
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
        : calculateTonnageReceivedNotExported(wasteReceivedRecords),
    tonnageRefusedAtDestination,
    tonnageStoppedDuringExport,
    totalTonnageRefusedOrStopped,
    tonnageRepatriated: getTonnageRepatriated(repatriatedRecords)
  }
}
