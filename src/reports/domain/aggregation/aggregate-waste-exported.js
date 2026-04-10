import {
  add,
  toDecimal,
  roundToTwoDecimalPlaces,
  toNumber
} from '#common/helpers/decimal-utils.js'
import { groupAndSum, isYes } from './helpers.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { isDateInRange } from './filter-records-by-date.js'

const ORS_ID_DIGITS = 3
const ZERO = '0'

const zeroPadOrsId = (orsId) => String(orsId).padStart(ORS_ID_DIGITS, ZERO)

const summariseTonnage = (grouped) =>
  grouped.map(({ tonnageDecimal, ...rest }) => ({
    ...rest,
    tonnageExported: roundToTwoDecimalPlaces(tonnageDecimal)
  }))

const generateOverseasSiteSummaries = (wasteExportedRecords, orsDetailsMap) => {
  // OSR_ID is wrongly named, it should be ORS_ID but its a significant amount of work to correct that.
  const recordsWithOrsId = wasteExportedRecords.filter(
    ({ data }) => data.OSR_ID
  )

  const hasApprovedSite = ({ data }) => {
    const details = orsDetailsMap.get(zeroPadOrsId(data.OSR_ID))
    return Boolean(details?.siteName)
  }

  const getTonnage = ({ data }) =>
    toNumber(data.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED)

  const overseasSites = summariseTonnage(
    groupAndSum(
      recordsWithOrsId.filter(hasApprovedSite),
      ({ data }) => zeroPadOrsId(data.OSR_ID),
      ({ data }) => {
        const orsId = zeroPadOrsId(data.OSR_ID)
        const details = orsDetailsMap.get(orsId)
        return {
          orsId,
          siteName: details.siteName,
          country: details.country
        }
      },
      getTonnage
    )
  )

  const unapprovedOverseasSites = summariseTonnage(
    groupAndSum(
      recordsWithOrsId.filter((record) => !hasApprovedSite(record)),
      ({ data }) => zeroPadOrsId(data.OSR_ID),
      ({ data }) => ({ orsId: zeroPadOrsId(data.OSR_ID) }),
      getTonnage
    )
  )

  return { overseasSites, unapprovedOverseasSites }
}

function getTonnageRepatriated(repatriatedRecords) {
  return roundToTwoDecimalPlaces(
    repatriatedRecords
      .filter(({ type }) => type === WASTE_RECORD_TYPE.EXPORTED)
      .reduce(
        (sum, { data }) =>
          add(sum, toNumber(data.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED)),
        toDecimal(0)
      )
  )
}

function calculateTonnageReceivedNotExported(
  wasteReceivedRecords,
  startDate,
  endDate
) {
  return roundToTwoDecimalPlaces(
    wasteReceivedRecords
      .filter(
        ({ data }) => !isDateInRange(data.DATE_OF_EXPORT, startDate, endDate)
      )
      .reduce(
        (sum, { data }) => add(sum, toNumber(data.TONNAGE_RECEIVED_FOR_EXPORT)),
        toDecimal(0)
      )
  )
}

/**
 * @param {object} params
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} params.wasteExportedRecords
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} params.repatriatedRecords
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} params.wasteReceivedRecords
 * @param {string} params.startDate - ISO date string (YYYY-MM-DD)
 * @param {string} params.endDate - ISO date string (YYYY-MM-DD)
 * @param {Map<string, { siteName: string|null, country: string|null }>} [params.orsDetailsMap]
 */
export function aggregateWasteExported({
  wasteExportedRecords,
  repatriatedRecords,
  wasteReceivedRecords,
  startDate,
  endDate,
  orsDetailsMap = new Map()
}) {
  const exportedRecords = wasteExportedRecords.filter(
    ({ type }) => type === WASTE_RECORD_TYPE.EXPORTED
  )

  const totalTonnageExportedDecimal = exportedRecords.reduce(
    (sum, { data }) =>
      add(sum, toNumber(data.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED)),
    toDecimal(0)
  )
  const totalTonnageExported = roundToTwoDecimalPlaces(
    totalTonnageExportedDecimal
  )
  const { refusedDecimal, stoppedDecimal, refusedOrStoppedDecimal } =
    exportedRecords.reduce(
      (acc, { data }) => {
        const tonnage = toNumber(data.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED)
        const refused = isYes(data.WAS_THE_WASTE_REFUSED)
        const stopped = isYes(data.WAS_THE_WASTE_STOPPED)
        return {
          refusedDecimal: refused
            ? add(acc.refusedDecimal, tonnage)
            : acc.refusedDecimal,
          stoppedDecimal: stopped
            ? add(acc.stoppedDecimal, tonnage)
            : acc.stoppedDecimal,
          refusedOrStoppedDecimal:
            refused || stopped
              ? add(acc.refusedOrStoppedDecimal, tonnage)
              : acc.refusedOrStoppedDecimal
        }
      },
      {
        refusedDecimal: toDecimal(0),
        stoppedDecimal: toDecimal(0),
        refusedOrStoppedDecimal: toDecimal(0)
      }
    )

  const tonnageRefusedAtDestination = roundToTwoDecimalPlaces(refusedDecimal)
  const tonnageStoppedDuringExport = roundToTwoDecimalPlaces(stoppedDecimal)
  const totalTonnageRefusedOrStopped = roundToTwoDecimalPlaces(
    refusedOrStoppedDecimal
  )

  const { overseasSites, unapprovedOverseasSites } =
    generateOverseasSiteSummaries(exportedRecords, orsDetailsMap)

  return {
    overseasSites,
    unapprovedOverseasSites,
    totalTonnageExported,
    tonnageReceivedNotExported: calculateTonnageReceivedNotExported(
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
