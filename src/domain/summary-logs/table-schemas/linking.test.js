import { everyTemplateTable } from './index.js'

/**
 * What a linked row may supply, and what it always takes from the previous
 * year's row (ADR-0060). A column added to a linking table fails here until
 * someone decides which it is.
 */
const EXPECTED = {
  'EXPORTER 2027 RECEIVED_LOADS_FOR_EXPORT': {
    suppliable: [
      'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED',
      'DATE_OF_EXPORT',
      'BASEL_EXPORT_CODE',
      'CUSTOMS_CODES',
      'CONTAINER_NUMBER',
      'DATE_RECEIVED_BY_OSR',
      'OSR_ID',
      'DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE',
      'INTERIM_SITE_ID',
      'TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR',
      'EXPORT_CONTROLS',
      'EXIT_PORT',
      'DWT_EXPORT_ID',
      'WAS_THE_WASTE_REFUSED',
      'WAS_THE_WASTE_STOPPED',
      'DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED',
      'OSR_NAME',
      'OSR_COUNTRY',
      'TONNAGE_RECEIVED_BY_OSR',
      'BILL_OF_LANDING_REFERENCE_NUMBER',
      'CUSTOMS_DECLARATION_NUMBER'
    ],
    inherited: [
      'DATE_RECEIVED_FOR_EXPORT',
      'EWC_CODE',
      'DESCRIPTION_WASTE',
      'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE',
      'GROSS_WEIGHT',
      'TARE_WEIGHT',
      'PALLET_WEIGHT',
      'NET_WEIGHT',
      'BAILING_WIRE_PROTOCOL',
      'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION',
      'WEIGHT_OF_NON_TARGET_MATERIALS',
      'RECYCLABLE_PROPORTION_PERCENTAGE',
      'TONNAGE_RECEIVED_FOR_EXPORT',
      'SUPPLIER_NAME',
      'SUPPLIER_ADDRESS',
      'SUPPLIER_POSTCODE',
      'SUPPLIER_EMAIL',
      'SUPPLIER_PHONE_NUMBER',
      'ACTIVITIES_CARRIED_OUT_BY_SUPPLIER',
      'YOUR_REFERENCE',
      'WEIGHBRIDGE_TICKET',
      'WASTE_TRANSFER_NOTE',
      'LOADING_SITE_NAME',
      'LOADING_SITE_ADDRESS',
      'LOADING_SITE_POSTCODE',
      'LOADING_SITE_EMAIL',
      'LOADING_SITE_PHONE_NUMBER',
      'CARRIER_NAME',
      'CBD',
      'CARRIER_VEHICLE_REGISTRATION_NUMBER',
      'DWT_SUPPLY_ID'
    ]
  },
  'EXPORTER_REGISTERED_ONLY 2027 LOADS_EXPORTED': {
    suppliable: [
      'WAS_THE_WASTE_REFUSED',
      'WAS_THE_WASTE_STOPPED',
      'DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED'
    ],
    inherited: [
      'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED',
      'DATE_OF_EXPORT',
      'OSR_ID',
      'BASEL_EXPORT_CODE',
      'OSR_NAME',
      'OSR_COUNTRY',
      'CUSTOMS_CODES',
      'CONTAINER_NUMBER',
      'EXIT_PORT',
      'DWT_EXPORT_ID'
    ]
  }
}

const linkingTables = everyTemplateTable().flatMap(
  ({ processingType, year, tableName, schema }) =>
    schema.linking
      ? [
          {
            table: `${processingType} ${year} ${tableName}`,
            rowIdField: schema.rowIdField,
            linking: schema.linking,
            requiredHeaders: schema.requiredHeaders
          }
        ]
      : []
)

describe('tables that link years', () => {
  it('are the 2027 exporter tables', () => {
    expect(linkingTables.map(({ table }) => table).sort()).toEqual(
      Object.keys(EXPECTED).sort()
    )
  })

  describe.each(linkingTables)(
    '$table',
    ({ table, rowIdField, linking, requiredHeaders }) => {
      it('lets a linked row supply only the export and overseas columns', () => {
        expect([...linking.suppliableOnLinkedRow].sort()).toEqual(
          [...EXPECTED[table].suppliable].sort()
        )
      })

      it('takes every other column from the previous year', () => {
        const decided = new Set([
          rowIdField,
          linking.previousYearRowIdField,
          ...linking.suppliableOnLinkedRow
        ])

        expect(
          requiredHeaders.filter((header) => !decided.has(header)).sort()
        ).toEqual([...EXPECTED[table].inherited].sort())
      })
    }
  )
})
