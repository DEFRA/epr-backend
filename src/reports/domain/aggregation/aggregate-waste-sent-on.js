import {
  addRounded,
  roundToTwoDecimalPlaces,
  toDecimal,
  toNumber
} from '#common/helpers/decimal-utils.js'
import {
  formatAddress,
  groupAndSum,
  isTonnageGreaterThanZero,
  TONNAGE_DECIMAL_PLACES
} from './helpers.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

/**
 * @param {Array<{data: object}>} validEntries
 */
function sumByFacilityType(validEntries) {
  let toReprocessorDecimal = toDecimal(0)
  let toExporterDecimal = toDecimal(0)
  let toAnotherSiteDecimal = toDecimal(0)

  for (const { data } of validEntries) {
    const tonnage = data.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON
    const facilityType = data.FINAL_DESTINATION_FACILITY_TYPE

    if (facilityType === 'Reprocessor') {
      toReprocessorDecimal = addRounded(
        toReprocessorDecimal,
        tonnage,
        TONNAGE_DECIMAL_PLACES
      )
    } else if (facilityType === 'Exporter') {
      toExporterDecimal = addRounded(
        toExporterDecimal,
        tonnage,
        TONNAGE_DECIMAL_PLACES
      )
    } else {
      toAnotherSiteDecimal = addRounded(
        toAnotherSiteDecimal,
        tonnage,
        TONNAGE_DECIMAL_PLACES
      )
    }
  }

  return { toReprocessorDecimal, toExporterDecimal, toAnotherSiteDecimal }
}

/**
 * @param {import('./aggregate-report-detail.js').ReportableWasteRecordState[]} wasteSentOnRecords
 */
export function aggregateWasteSentOn(wasteSentOnRecords) {
  const validEntries = wasteSentOnRecords.filter(
    ({ wasteRecordType, data }) => {
      const tonnage = toNumber(data.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON)
      return (
        wasteRecordType === WASTE_RECORD_TYPE.SENT_ON &&
        isTonnageGreaterThanZero(tonnage)
      )
    }
  )

  const { toReprocessorDecimal, toExporterDecimal, toAnotherSiteDecimal } =
    sumByFacilityType(validEntries)

  const finalDestinations = groupAndSum(
    validEntries,
    ({ data }) =>
      [
        data.FINAL_DESTINATION_NAME,
        data.FINAL_DESTINATION_FACILITY_TYPE,
        formatAddress(
          data.FINAL_DESTINATION_ADDRESS,
          data.FINAL_DESTINATION_POSTCODE
        )
      ].join('\x00'),
    ({ data }) => ({
      recipientName: data.FINAL_DESTINATION_NAME,
      facilityType: data.FINAL_DESTINATION_FACILITY_TYPE,
      address: formatAddress(
        data.FINAL_DESTINATION_ADDRESS,
        data.FINAL_DESTINATION_POSTCODE
      )
    }),
    ({ data }) => data.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON
  ).map(({ tonnageDecimal, ...rest }) => ({
    ...rest,
    tonnageSentOn: roundToTwoDecimalPlaces(tonnageDecimal)
  }))

  return {
    tonnageSentToReprocessor: roundToTwoDecimalPlaces(toReprocessorDecimal),
    tonnageSentToExporter: roundToTwoDecimalPlaces(toExporterDecimal),
    tonnageSentToAnotherSite: roundToTwoDecimalPlaces(toAnotherSiteDecimal),
    finalDestinations
  }
}
