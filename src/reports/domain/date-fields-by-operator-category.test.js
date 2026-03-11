import { describe, expect, it } from 'vitest'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { DATE_FIELDS_BY_OPERATOR_CATEGORY } from './date-fields-by-operator-category.js'

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
