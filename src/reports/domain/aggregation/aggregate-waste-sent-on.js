import {
  add,
  isZero,
  toNumber,
  toDecimal,
  roundToTwoDecimalPlaces
} from '#common/helpers/decimal-utils.js'
import { formatAddress, groupAndSum } from './helpers.js'

/**
 * @param {Array<{data: object, tonnage: number}>} validEntries
 */
function sumByFacilityType(validEntries) {
  let toReprocessorDecimal = toDecimal(0)
  let toExporterDecimal = toDecimal(0)
  let toAnotherSiteDecimal = toDecimal(0)

  for (const { data, tonnage } of validEntries) {
    const facilityType = data.FINAL_DESTINATION_FACILITY_TYPE

    if (facilityType === 'Reprocessor') {
      toReprocessorDecimal = add(toReprocessorDecimal, tonnage)
    } else if (facilityType === 'Exporter') {
      toExporterDecimal = add(toExporterDecimal, tonnage)
    } else {
      toAnotherSiteDecimal = add(toAnotherSiteDecimal, tonnage)
    }
  }

  return { toReprocessorDecimal, toExporterDecimal, toAnotherSiteDecimal }
}

/**
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} wasteSentOnRecords
 */
export function aggregateWasteSentOn(wasteSentOnRecords) {
  const validEntries = wasteSentOnRecords
    .map(({ data }) => ({
      data,
      tonnage: toNumber(data.TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON)
    }))
    .filter(({ tonnage }) => Number.isFinite(tonnage) && !isZero(tonnage))

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
    ({ tonnage }) => tonnage
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
