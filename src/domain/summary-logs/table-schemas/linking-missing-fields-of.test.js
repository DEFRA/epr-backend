import { RECEIVED_LOADS_FOR_EXPORT_2027 } from './exporter/received-loads-for-export.js'
import { LOADS_EXPORTED_2027 } from './exporter-registered-only/loads-exported.js'

const EVERY_ACCREDITED_ROW = [
  'SUPPLIER_NAME',
  'SUPPLIER_ADDRESS',
  'SUPPLIER_POSTCODE',
  'SUPPLIER_EMAIL',
  'SUPPLIER_PHONE_NUMBER',
  'ACTIVITIES_CARRIED_OUT_BY_SUPPLIER',
  'DATE_RECEIVED_FOR_EXPORT',
  'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE',
  'RECYCLABLE_PROPORTION_PERCENTAGE',
  'TONNAGE_RECEIVED_FOR_EXPORT'
]

const COMPLETE_ACCREDITED_ROW = {
  SUPPLIER_NAME: 'Supplier Ltd',
  SUPPLIER_ADDRESS: '1 High Street',
  SUPPLIER_POSTCODE: 'AB1 2CD',
  SUPPLIER_EMAIL: 'supplier@example.com',
  SUPPLIER_PHONE_NUMBER: '01234 567890',
  ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Sorting',
  DATE_RECEIVED_FOR_EXPORT: '2026-10-01',
  WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
  RECYCLABLE_PROPORTION_PERCENTAGE: 0.9,
  TONNAGE_RECEIVED_FOR_EXPORT: 9
}

describe('linking.missingFieldsOf', () => {
  describe('accredited RECEIVED_LOADS_FOR_EXPORT', () => {
    const { missingFieldsOf } = RECEIVED_LOADS_FOR_EXPORT_2027.linking

    it.each([
      ['every column it needs', COMPLETE_ACCREDITED_ROW, []],
      ['nothing', {}, EVERY_ACCREDITED_ROW],
      [
        'no supplier name',
        { ...COMPLETE_ACCREDITED_ROW, SUPPLIER_NAME: '' },
        ['SUPPLIER_NAME']
      ],
      [
        'a PRN answer still on its placeholder',
        {
          ...COMPLETE_ACCREDITED_ROW,
          WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'Choose option'
        },
        ['WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE']
      ],
      [
        'a date of export and no overseas reprocessor ID',
        { ...COMPLETE_ACCREDITED_ROW, DATE_OF_EXPORT: '2026-11-01' },
        ['OSR_ID']
      ],
      [
        'a date of export and an overseas reprocessor ID',
        {
          ...COMPLETE_ACCREDITED_ROW,
          DATE_OF_EXPORT: '2026-11-01',
          OSR_ID: '001'
        },
        []
      ],
      [
        'an overseas reprocessor ID and no date of export',
        { ...COMPLETE_ACCREDITED_ROW, OSR_ID: '001' },
        []
      ],
      [
        'a tonnage exported and no date of export',
        {
          ...COMPLETE_ACCREDITED_ROW,
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 8
        },
        ['DATE_OF_EXPORT']
      ],
      [
        'a tonnage exported of 0 and no date of export',
        {
          ...COMPLETE_ACCREDITED_ROW,
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 0
        },
        ['DATE_OF_EXPORT']
      ],
      [
        'a tonnage exported and a date of export',
        {
          ...COMPLETE_ACCREDITED_ROW,
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 8,
          DATE_OF_EXPORT: '2026-11-01',
          OSR_ID: '001'
        },
        []
      ]
    ])('with %s', (_, row, expected) => {
      expect(missingFieldsOf(row)).toStrictEqual(expected)
    })
  })

  describe('registered-only LOADS_EXPORTED', () => {
    const { missingFieldsOf } = LOADS_EXPORTED_2027.linking

    it.each([
      ['nothing', {}, []],
      [
        'a date of export and nothing else',
        { DATE_OF_EXPORT: '2026-11-01' },
        ['TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED', 'OSR_ID']
      ],
      [
        'a date of export, a tonnage exported and an overseas reprocessor ID',
        {
          DATE_OF_EXPORT: '2026-11-01',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 8,
          OSR_ID: '001'
        },
        []
      ],
      [
        'a tonnage exported and no date of export',
        { TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 8 },
        ['DATE_OF_EXPORT']
      ],
      [
        'a tonnage exported of 0 and no date of export',
        { TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 0 },
        ['DATE_OF_EXPORT']
      ],
      ['an overseas reprocessor ID only', { OSR_ID: '001' }, []]
    ])('with %s', (_, row, expected) => {
      expect(missingFieldsOf(row)).toStrictEqual(expected)
    })
  })
})
