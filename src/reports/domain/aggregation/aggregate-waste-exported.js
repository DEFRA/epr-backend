import {
  add,
  subtract,
  toDecimal,
  roundToTwoDecimalPlaces,
  toNumber,
  isNegative
} from '#common/helpers/decimal-utils.js'
import { groupAndSum, isYes } from './helpers.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

const ORS_ID_DIGITS = 3
const ZERO = '0'

const zeroPadOrsId = (orsId) => String(orsId).padStart(ORS_ID_DIGITS, ZERO)

const generateOverseasSiteSummary = (wasteExportedRecords, orsDetailsMap) => {
  // OSR_ID is wrongly named, it should be ORS_ID but its a significant amount of work to correct that.
  return groupAndSum(
    wasteExportedRecords.filter(({ data }) => data.OSR_ID),
    ({ data }) => data.OSR_ID,
    ({ data }) => {
      const details = orsDetailsMap.get(zeroPadOrsId(data.OSR_ID))
      return {
        orsId: data.OSR_ID,
        siteName: details?.siteName ?? null,
        country: details?.country ?? null
      }
    },
    ({ data }) => toNumber(data.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED)
  ).map(({ tonnageDecimal, ...rest }) => ({
    ...rest,
    tonnageExported: roundToTwoDecimalPlaces(tonnageDecimal)
  }))
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

function calculateTonnageNotExported(
  totalTonnageReceived,
  totalTonnageExportedDecimal
) {
  const receivedMinusExported = subtract(
    toDecimal(totalTonnageReceived),
    totalTonnageExportedDecimal
  )
  return roundToTwoDecimalPlaces(
    isNegative(receivedMinusExported) ? toDecimal(0) : receivedMinusExported
  )
}

/**
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} wasteExportedRecords
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} repatriatedRecords
 * @param {number} totalTonnageReceived
 * @param {Map<string, { siteName: string|null, country: string|null }>} [orsDetailsMap]
 */
export function aggregateWasteExported(
  wasteExportedRecords,
  repatriatedRecords,
  totalTonnageReceived,
  orsDetailsMap = new Map()
) {
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

  return {
    overseasSites: generateOverseasSiteSummary(exportedRecords, orsDetailsMap),
    totalTonnageExported,
    tonnageReceivedNotExported: calculateTonnageNotExported(
      totalTonnageReceived,
      totalTonnageExportedDecimal
    ),
    tonnageRefusedAtDestination,
    tonnageStoppedDuringExport,
    totalTonnageRefusedOrStopped,
    tonnageRepatriated: getTonnageRepatriated(repatriatedRecords)
  }
}
