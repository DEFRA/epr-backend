import {
  add,
  isZero,
  toNumber,
  toDecimal,
  roundToTwoDecimalPlaces
} from '#common/helpers/decimal-utils.js'
import { formatAddress, groupAndSum } from './helpers.js'

/**
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} wasteReceivedRecords
 * @param {string} tonnageField
 */
export function aggregateWasteReceived(wasteReceivedRecords, tonnageField) {
  const validEntries = wasteReceivedRecords.filter(({ data }) => {
    const tonnage = toNumber(data[tonnageField])
    return Number.isFinite(tonnage) && !isZero(tonnage)
  })

  const totalTonnageDecimal = validEntries.reduce(
    (acc, { data }) => add(acc, data[tonnageField]),
    toDecimal(0)
  )

  const suppliers = groupAndSum(
    validEntries,
    ({ data }) =>
      [
        data.SUPPLIER_NAME,
        data.ACTIVITIES_CARRIED_OUT_BY_SUPPLIER,
        formatAddress(data.SUPPLIER_ADDRESS, data.SUPPLIER_POSTCODE),
        data.SUPPLIER_PHONE_NUMBER,
        data.SUPPLIER_EMAIL
      ].join('\x00'),
    ({ data }) => ({
      supplierName: data.SUPPLIER_NAME ?? null,
      facilityType: data.ACTIVITIES_CARRIED_OUT_BY_SUPPLIER ?? null,
      supplierAddress: formatAddress(
        data.SUPPLIER_ADDRESS,
        data.SUPPLIER_POSTCODE
      ),
      supplierPhone: data.SUPPLIER_PHONE_NUMBER ?? null,
      supplierEmail: data.SUPPLIER_EMAIL ?? null
    }),
    ({ data }) => data[tonnageField]
  ).map(({ tonnageDecimal, ...rest }) => ({
    ...rest,
    tonnageReceived: roundToTwoDecimalPlaces(tonnageDecimal)
  }))

  return {
    suppliers,
    totalTonnageReceived: roundToTwoDecimalPlaces(totalTonnageDecimal),
    tonnageRecycled: null,
    tonnageNotRecycled: null
  }
}
