import { toNumber } from '#common/helpers/decimal-utils.js'
import {
  ZERO_TONNAGE,
  addTonnage,
  toRoundedTonnage
} from '#common/helpers/rounded-tonnage.js'
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

const isWasteReceivedType = (type) => WASTE_RECEIVED_TYPES.has(type)

/**
 * @param {import('./aggregate-report-detail.js').ReportableWasteRecordState[]} wasteReceivedRecords
 * @param {string} tonnageField
 */
export function aggregateWasteReceived(wasteReceivedRecords, tonnageField) {
  const validEntries = wasteReceivedRecords.filter(
    ({ wasteRecordType, data }) => {
      const tonnage = toNumber(data[tonnageField])
      return (
        isWasteReceivedType(wasteRecordType) &&
        isTonnageGreaterThanZero(tonnage)
      )
    }
  )

  const totalTonnageDecimal = validEntries.reduce(
    (acc, { data }) => addTonnage(acc, toRoundedTonnage(data[tonnageField])),
    ZERO_TONNAGE
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
    ({ data }) => toRoundedTonnage(data[tonnageField])
  ).map(({ tonnageDecimal, ...rest }) => ({
    ...rest,
    tonnageReceived: toNumber(tonnageDecimal)
  }))

  return {
    suppliers,
    totalTonnageReceived: toNumber(totalTonnageDecimal),
    tonnageRecycled: null,
    tonnageNotRecycled: null
  }
}
