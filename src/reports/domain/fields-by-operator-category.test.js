import { describe, expect, it } from 'vitest'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import {
  DATE_FIELDS_BY_OPERATOR_CATEGORY,
  SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY,
  TONNAGE_RECEIVED_FIELD_BY_OPERATOR_CATEGORY
} from './fields-by-operator-category.js'

describe('DATE_FIELDS_BY_OPERATOR_CATEGORY', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(DATE_FIELDS_BY_OPERATOR_CATEGORY)).toBe(true)
  })

  it('has entries for all operator categories', () => {
    expect(Object.keys(DATE_FIELDS_BY_OPERATOR_CATEGORY).sort()).toStrictEqual([
      'EXPORTER',
      'EXPORTER_REGISTERED_ONLY',
      'REPROCESSOR',
      'REPROCESSOR_REGISTERED_ONLY'
    ])
  })

  describe('EXPORTER', () => {
    it('maps exported records to DATE_RECEIVED_FOR_EXPORT and DATE_OF_EXPORT', () => {
      expect(
        DATE_FIELDS_BY_OPERATOR_CATEGORY.EXPORTER[WASTE_RECORD_TYPE.EXPORTED]
      ).toStrictEqual(['DATE_RECEIVED_FOR_EXPORT', 'DATE_OF_EXPORT'])
    })

    it('maps sentOn records to DATE_LOAD_LEFT_SITE', () => {
      expect(
        DATE_FIELDS_BY_OPERATOR_CATEGORY.EXPORTER[WASTE_RECORD_TYPE.SENT_ON]
      ).toStrictEqual(['DATE_LOAD_LEFT_SITE'])
    })
  })

  describe('EXPORTER_REGISTERED_ONLY', () => {
    it('maps received records to MONTH_RECEIVED_FOR_EXPORT', () => {
      expect(
        DATE_FIELDS_BY_OPERATOR_CATEGORY.EXPORTER_REGISTERED_ONLY[
          WASTE_RECORD_TYPE.RECEIVED
        ]
      ).toStrictEqual(['MONTH_RECEIVED_FOR_EXPORT'])
    })

    it('maps exported records to DATE_OF_EXPORT', () => {
      expect(
        DATE_FIELDS_BY_OPERATOR_CATEGORY.EXPORTER_REGISTERED_ONLY[
          WASTE_RECORD_TYPE.EXPORTED
        ]
      ).toStrictEqual(['DATE_OF_EXPORT'])
    })

    it('maps sentOn records to DATE_LOAD_LEFT_SITE', () => {
      expect(
        DATE_FIELDS_BY_OPERATOR_CATEGORY.EXPORTER_REGISTERED_ONLY[
          WASTE_RECORD_TYPE.SENT_ON
        ]
      ).toStrictEqual(['DATE_LOAD_LEFT_SITE'])
    })
  })

  describe('REPROCESSOR', () => {
    it('maps received records to DATE_RECEIVED_FOR_REPROCESSING', () => {
      expect(
        DATE_FIELDS_BY_OPERATOR_CATEGORY.REPROCESSOR[WASTE_RECORD_TYPE.RECEIVED]
      ).toStrictEqual(['DATE_RECEIVED_FOR_REPROCESSING'])
    })

    it('maps processed records to DATE_LOAD_LEFT_SITE', () => {
      expect(
        DATE_FIELDS_BY_OPERATOR_CATEGORY.REPROCESSOR[
          WASTE_RECORD_TYPE.PROCESSED
        ]
      ).toStrictEqual(['DATE_LOAD_LEFT_SITE'])
    })

    it('maps sentOn records to DATE_LOAD_LEFT_SITE', () => {
      expect(
        DATE_FIELDS_BY_OPERATOR_CATEGORY.REPROCESSOR[WASTE_RECORD_TYPE.SENT_ON]
      ).toStrictEqual(['DATE_LOAD_LEFT_SITE'])
    })
  })

  describe('REPROCESSOR_REGISTERED_ONLY', () => {
    it('maps received records to MONTH_RECEIVED_FOR_REPROCESSING', () => {
      expect(
        DATE_FIELDS_BY_OPERATOR_CATEGORY.REPROCESSOR_REGISTERED_ONLY[
          WASTE_RECORD_TYPE.RECEIVED
        ]
      ).toStrictEqual(['MONTH_RECEIVED_FOR_REPROCESSING'])
    })

    it('maps sentOn records to DATE_LOAD_LEFT_SITE', () => {
      expect(
        DATE_FIELDS_BY_OPERATOR_CATEGORY.REPROCESSOR_REGISTERED_ONLY[
          WASTE_RECORD_TYPE.SENT_ON
        ]
      ).toStrictEqual(['DATE_LOAD_LEFT_SITE'])
    })
  })
})

describe('SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY)).toBe(true)
  })

  it('has entries for all operator categories', () => {
    expect(
      Object.keys(SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY).sort()
    ).toStrictEqual([
      'EXPORTER',
      'EXPORTER_REGISTERED_ONLY',
      'REPROCESSOR',
      'REPROCESSOR_REGISTERED_ONLY'
    ])
  })

  it('maps EXPORTER sections to per-section date fields', () => {
    expect(SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY.EXPORTER).toStrictEqual({
      wasteReceived: 'DATE_RECEIVED_FOR_EXPORT',
      wasteExported: 'DATE_OF_EXPORT',
      wasteSentOn: 'DATE_LOAD_LEFT_SITE'
    })
  })

  it('maps EXPORTER_REGISTERED_ONLY sections to per-section date fields', () => {
    expect(
      SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY.EXPORTER_REGISTERED_ONLY
    ).toStrictEqual({
      wasteReceived: 'MONTH_RECEIVED_FOR_EXPORT',
      wasteExported: 'DATE_OF_EXPORT',
      wasteSentOn: 'DATE_LOAD_LEFT_SITE'
    })
  })

  it('maps REPROCESSOR sections without wasteExported', () => {
    expect(SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY.REPROCESSOR).toStrictEqual({
      wasteReceived: 'DATE_RECEIVED_FOR_REPROCESSING',
      wasteSentOn: 'DATE_LOAD_LEFT_SITE'
    })
  })

  it('maps REPROCESSOR_REGISTERED_ONLY sections without wasteExported', () => {
    expect(
      SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY.REPROCESSOR_REGISTERED_ONLY
    ).toStrictEqual({
      wasteReceived: 'MONTH_RECEIVED_FOR_REPROCESSING',
      wasteSentOn: 'DATE_LOAD_LEFT_SITE'
    })
  })
})

describe('TONNAGE_RECEIVED_FIELD_BY_OPERATOR_CATEGORY', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(TONNAGE_RECEIVED_FIELD_BY_OPERATOR_CATEGORY)).toBe(
      true
    )
  })

  it('has entries for all operator categories', () => {
    expect(
      Object.keys(TONNAGE_RECEIVED_FIELD_BY_OPERATOR_CATEGORY).sort()
    ).toStrictEqual([
      'EXPORTER',
      'EXPORTER_REGISTERED_ONLY',
      'REPROCESSOR',
      'REPROCESSOR_REGISTERED_ONLY'
    ])
  })

  it('maps reprocessor categories to TONNAGE_RECEIVED_FOR_RECYCLING', () => {
    expect(TONNAGE_RECEIVED_FIELD_BY_OPERATOR_CATEGORY.REPROCESSOR).toBe(
      'TONNAGE_RECEIVED_FOR_RECYCLING'
    )
    expect(
      TONNAGE_RECEIVED_FIELD_BY_OPERATOR_CATEGORY.REPROCESSOR_REGISTERED_ONLY
    ).toBe('TONNAGE_RECEIVED_FOR_RECYCLING')
  })

  it('maps exporter categories to TONNAGE_RECEIVED_FOR_EXPORT', () => {
    expect(TONNAGE_RECEIVED_FIELD_BY_OPERATOR_CATEGORY.EXPORTER).toBe(
      'TONNAGE_RECEIVED_FOR_EXPORT'
    )
    expect(
      TONNAGE_RECEIVED_FIELD_BY_OPERATOR_CATEGORY.EXPORTER_REGISTERED_ONLY
    ).toBe('TONNAGE_RECEIVED_FOR_EXPORT')
  })
})
