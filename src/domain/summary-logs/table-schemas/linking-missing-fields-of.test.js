import { RECEIVED_LOADS_FOR_EXPORT_2027 } from './exporter/received-loads-for-export.js'
import { LOADS_EXPORTED_2027 } from './exporter-registered-only/loads-exported.js'

/** @import {ReceivedLoadsField} from './exporter/fields.js' */
/** @import {LoadsExportedField} from './exporter-registered-only/fields.js' */

/**
 * @template {string} Field
 * @typedef {{
 *   description: string,
 *   row: Partial<Record<Field, unknown>>,
 *   missing: Field[]
 * }} MissingFieldsCase
 */

/** @type {Partial<Record<ReceivedLoadsField, unknown>>} */
const COMPLETE_RECEIVED_LOAD = {
  DATE_RECEIVED_FOR_EXPORT: '2026-11-02',
  WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
  RECYCLABLE_PROPORTION_PERCENTAGE: 0.85,
  TONNAGE_RECEIVED_FOR_EXPORT: 8.5,
  SUPPLIER_NAME: 'Supplier Ltd',
  SUPPLIER_ADDRESS: '1 High Street',
  SUPPLIER_POSTCODE: 'AB1 2CD',
  SUPPLIER_EMAIL: 'supplier@example.com',
  SUPPLIER_PHONE_NUMBER: '01234 567890',
  ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Collection'
}

/** @type {MissingFieldsCase<ReceivedLoadsField>[]} */
const RECEIVED_LOAD_CASES = [
  {
    description: 'a load received but not yet exported',
    row: {},
    missing: []
  },
  {
    description: 'an exported load',
    row: {
      TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 8,
      DATE_OF_EXPORT: '2026-12-18',
      OSR_ID: 101
    },
    missing: []
  },
  {
    description: 'no supplier email',
    row: { SUPPLIER_EMAIL: null },
    missing: ['SUPPLIER_EMAIL']
  },
  {
    description: 'the PRN question left on its placeholder',
    row: { WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'Choose option' },
    missing: ['WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE']
  },
  {
    description: 'a tonnage received of 0',
    row: { TONNAGE_RECEIVED_FOR_EXPORT: 0 },
    missing: []
  },
  {
    description: 'a tonnage exported but no date of export',
    row: { TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 8 },
    missing: ['DATE_OF_EXPORT']
  },
  {
    description: 'a tonnage exported of 0 but no date of export',
    row: { TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 0 },
    missing: ['DATE_OF_EXPORT']
  },
  {
    description: 'a date of export but no overseas reprocessor',
    row: { DATE_OF_EXPORT: '2026-12-18' },
    missing: ['OSR_ID']
  }
]

/** @type {MissingFieldsCase<LoadsExportedField>[]} */
const LOAD_EXPORTED_CASES = [
  { description: 'nothing exported', row: {}, missing: [] },
  {
    description: 'an exported load',
    row: {
      TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 4.2,
      DATE_OF_EXPORT: '2026-12-18',
      OSR_ID: 101
    },
    missing: []
  },
  {
    description: 'a date of export but no tonnage or overseas reprocessor',
    row: { DATE_OF_EXPORT: '2026-12-18' },
    missing: ['TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED', 'OSR_ID']
  },
  {
    description: 'a tonnage exported but no date of export',
    row: { TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 4.2 },
    missing: ['DATE_OF_EXPORT']
  },
  {
    description: 'a tonnage exported of 0 but no date of export',
    row: { TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 0 },
    missing: ['DATE_OF_EXPORT']
  }
]

describe('linking.missingFieldsOf', () => {
  describe('accredited RECEIVED_LOADS_FOR_EXPORT', () => {
    const { missingFieldsOf } = RECEIVED_LOADS_FOR_EXPORT_2027.linking

    it.for(RECEIVED_LOAD_CASES)('with $description', ({ row, missing }) => {
      expect(
        missingFieldsOf({ ...COMPLETE_RECEIVED_LOAD, ...row })
      ).toStrictEqual(missing)
    })

    it('lists every blank column in template order', () => {
      /** @type {ReceivedLoadsField[]} */
      const missing = [
        'DATE_RECEIVED_FOR_EXPORT',
        'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE',
        'RECYCLABLE_PROPORTION_PERCENTAGE',
        'TONNAGE_RECEIVED_FOR_EXPORT',
        'DATE_OF_EXPORT',
        'SUPPLIER_NAME',
        'SUPPLIER_ADDRESS',
        'SUPPLIER_POSTCODE',
        'SUPPLIER_EMAIL',
        'SUPPLIER_PHONE_NUMBER',
        'ACTIVITIES_CARRIED_OUT_BY_SUPPLIER'
      ]

      expect(
        missingFieldsOf({ TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 8 })
      ).toStrictEqual(missing)
    })
  })

  describe('registered-only LOADS_EXPORTED', () => {
    const { missingFieldsOf } = LOADS_EXPORTED_2027.linking

    it.for(LOAD_EXPORTED_CASES)('with $description', ({ row, missing }) => {
      expect(missingFieldsOf(row)).toStrictEqual(missing)
    })
  })
})
