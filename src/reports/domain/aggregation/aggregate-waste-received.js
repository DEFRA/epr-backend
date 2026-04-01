import {
  add,
  roundToTwoDecimalPlaces,
  toDecimal,
  toNumber
} from '#common/helpers/decimal-utils.js'
import {
  formatAddress,
  groupAndSum,
  isTonnageGreaterThanZero
} from './helpers.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

const WASTE_RECEIVED_TYPES = new Set([
  WASTE_RECORD_TYPE.EXPORTED,
  WASTE_RECORD_TYPE.RECEIVED
])

const isTypeWasteReceived = (type) => WASTE_RECEIVED_TYPES.has(type)

/**
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} wasteReceivedRecords
 * @param {string} tonnageField
 */
export function aggregateWasteReceived(wasteReceivedRecords, tonnageField) {
  const validEntries = wasteReceivedRecords.filter(({ type, data }) => {
    const tonnage = toNumber(data[tonnageField])
    return isTypeWasteReceived(type) && isTonnageGreaterThanZero(tonnage)
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
