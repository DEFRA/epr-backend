import { describe, expect, it } from 'vitest'
import {
  SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY,
  TONNAGE_RECEIVED_FIELD_BY_OPERATOR_CATEGORY
} from './aggregation/fields-by-operator-category.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

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
      wasteSentOn: 'DATE_LOAD_LEFT_SITE',
      wasteRepatriated: 'DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED'
    })
  })

  it('maps EXPORTER_REGISTERED_ONLY sections to per-section date fields', () => {
    expect(
      SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY.EXPORTER_REGISTERED_ONLY
    ).toStrictEqual({
      wasteReceived: 'MONTH_RECEIVED_FOR_EXPORT',
      wasteExported: 'DATE_OF_EXPORT',
      wasteSentOn: 'DATE_LOAD_LEFT_SITE',
      wasteRepatriated: 'DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED'
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

/**
 * Operator categories map to one or more processing types in the
 * summary-log table schemas. For accredited reprocessors, both
 * input and output use identical date fields so either suffices.
 */
const PROCESSING_TYPES_FOR_OPERATOR_CATEGORY = {
  REPROCESSOR: [PROCESSING_TYPES.REPROCESSOR_INPUT],
  REPROCESSOR_REGISTERED_ONLY: [PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY],
  EXPORTER: [PROCESSING_TYPES.EXPORTER],
  EXPORTER_REGISTERED_ONLY: [PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY]
}

/**
 * Report sections whose date field should appear in a table schema's
 * reportingDateFields array. Each entry maps a report section to the
 * wasteRecordType used to look up the corresponding table schema.
 *
 * Excluded sections:
 * - EXPORTER wasteRepatriated: the accredited exporter template has
 *   no repatriation date field; the report's slice returns empty.
 *
 * For accredited exporters, wasteReceived draws from the table
 * whose wasteRecordType is EXPORTED (received-loads-for-export),
 * not RECEIVED. The registered-only exporter variant has a
 * distinct received-loads table with wasteRecordType RECEIVED.
 */
const SECTION_TO_WASTE_RECORD_TYPE = {
  REPROCESSOR: {
    wasteReceived: WASTE_RECORD_TYPE.RECEIVED,
    wasteSentOn: WASTE_RECORD_TYPE.SENT_ON
  },
  REPROCESSOR_REGISTERED_ONLY: {
    wasteReceived: WASTE_RECORD_TYPE.RECEIVED,
    wasteSentOn: WASTE_RECORD_TYPE.SENT_ON
  },
  EXPORTER: {
    wasteReceived: WASTE_RECORD_TYPE.EXPORTED,
    wasteSentOn: WASTE_RECORD_TYPE.SENT_ON
  },
  EXPORTER_REGISTERED_ONLY: {
    wasteReceived: WASTE_RECORD_TYPE.RECEIVED,
    wasteExported: WASTE_RECORD_TYPE.EXPORTED,
    wasteRepatriated: WASTE_RECORD_TYPE.EXPORTED,
    wasteSentOn: WASTE_RECORD_TYPE.SENT_ON
  }
}

describe('consistency with table schema reportingDateField', () => {
  const cases = Object.entries(
    SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY
  ).flatMap(([operatorCategory, sections]) =>
    Object.entries(SECTION_TO_WASTE_RECORD_TYPE[operatorCategory])
      .filter(([section]) => sections[section] !== undefined)
      .flatMap(([section, wasteRecordType]) =>
        PROCESSING_TYPES_FOR_OPERATOR_CATEGORY[operatorCategory].map(
          (processingType) => ({
            operatorCategory,
            section,
            processingType,
            wasteRecordType
          })
        )
      )
  )

  it.each(cases)(
    '$operatorCategory/$section matches $processingType schema',
    ({ operatorCategory, section, processingType, wasteRecordType }) => {
      const sections =
        SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY[operatorCategory]
      const schema = findSchemaForProcessingType(
        processingType,
        wasteRecordType
      )

      expect(schema).not.toBeNull()
      expect(
        /** @type {NonNullable<typeof schema>} */ (schema).reportingDateFields
      ).toContain(sections[section])
    }
  )
})
