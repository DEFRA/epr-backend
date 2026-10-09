import { describe, expect, it } from 'vitest'
import {
  SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY,
  TONNAGE_RECEIVED_FIELD_BY_OPERATOR_CATEGORY,
  reportingDateFieldsForWorksheet
} from './aggregation/fields-by-operator-category.js'
import { OPERATOR_CATEGORY, isExporterCategory } from './operator-category.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { PROCESSING_TYPE_TABLES } from '#domain/summary-logs/table-schemas/index.js'

/** @import { OperatorCategory } from './operator-category.js' */

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

  it.each(Object.values(OPERATOR_CATEGORY))(
    'has a wasteExported field for %s only when it is an exporter category',
    (category) => {
      expect(
        'wasteExported' in SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY[category]
      ).toBe(isExporterCategory(category))
    }
  )
})

describe('reportingDateFieldsForWorksheet', () => {
  it('returns every reporting date the worksheet carries', () => {
    expect(
      reportingDateFieldsForWorksheet({
        requiredHeaders: [
          'ROW_ID',
          'DATE_RECEIVED_FOR_EXPORT',
          'TONNAGE_RECEIVED_FOR_EXPORT',
          'DATE_OF_EXPORT',
          'DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED'
        ]
      })
    ).toStrictEqual([
      'DATE_RECEIVED_FOR_EXPORT',
      'DATE_OF_EXPORT',
      'DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED'
    ])
  })

  it('returns only the reporting dates of a worksheet sharing a name with a richer one', () => {
    expect(
      reportingDateFieldsForWorksheet({
        requiredHeaders: [
          'ROW_ID',
          'MONTH_RECEIVED_FOR_EXPORT',
          'TONNAGE_RECEIVED_FOR_EXPORT'
        ]
      })
    ).toStrictEqual(['MONTH_RECEIVED_FOR_EXPORT'])
  })

  it('returns nothing for a worksheet without a reporting date', () => {
    expect(
      reportingDateFieldsForWorksheet({ requiredHeaders: ['ROW_ID'] })
    ).toStrictEqual([])
  })
})

describe('reporting date fields against the summary log templates', () => {
  const PROCESSING_TYPES_BY_OPERATOR_CATEGORY = {
    [OPERATOR_CATEGORY.EXPORTER]: [PROCESSING_TYPES.EXPORTER],
    [OPERATOR_CATEGORY.EXPORTER_REGISTERED_ONLY]: [
      PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY
    ],
    [OPERATOR_CATEGORY.REPROCESSOR]: [
      PROCESSING_TYPES.REPROCESSOR_INPUT,
      PROCESSING_TYPES.REPROCESSOR_OUTPUT
    ],
    [OPERATOR_CATEGORY.REPROCESSOR_REGISTERED_ONLY]: [
      PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY
    ]
  }

  /**
   * @param {string} operatorCategory
   * @returns {string[]}
   */
  const categoryDateFields = (operatorCategory) =>
    Object.values(
      SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY[
        /** @type {OperatorCategory} */ (operatorCategory)
      ]
    )

  const worksheets = Object.entries(
    PROCESSING_TYPES_BY_OPERATOR_CATEGORY
  ).flatMap(([operatorCategory, processingTypes]) =>
    processingTypes.flatMap((processingType) =>
      Object.entries(PROCESSING_TYPE_TABLES[processingType]).map(
        ([tableName, schema]) => ({
          operatorCategory,
          processingType,
          tableName,
          schema
        })
      )
    )
  )

  it('covers every processing type with a template', () => {
    expect(
      Object.values(PROCESSING_TYPES_BY_OPERATOR_CATEGORY).flat().sort()
    ).toStrictEqual(Object.keys(PROCESSING_TYPE_TABLES).sort())
  })

  it.each(
    Object.entries(PROCESSING_TYPES_BY_OPERATOR_CATEGORY).flatMap(
      ([operatorCategory, processingTypes]) =>
        categoryDateFields(operatorCategory).flatMap((field) =>
          processingTypes.map((processingType) => ({
            operatorCategory,
            processingType,
            field
          }))
        )
    )
  )(
    '$operatorCategory: $field is a required header on a $processingType table',
    ({ processingType, field }) => {
      const requiredHeaders = Object.values(
        PROCESSING_TYPE_TABLES[processingType]
      ).flatMap((schema) => schema.requiredHeaders)

      expect(requiredHeaders).toContain(field)
    }
  )

  it.each(worksheets)(
    '$processingType/$tableName carries a reporting date field',
    ({ schema }) => {
      expect(reportingDateFieldsForWorksheet(schema)).not.toHaveLength(0)
    }
  )

  it.each(worksheets)(
    '$processingType/$tableName carries only $operatorCategory reporting date fields',
    ({ operatorCategory, schema }) => {
      expect(categoryDateFields(operatorCategory)).toEqual(
        expect.arrayContaining(reportingDateFieldsForWorksheet(schema))
      )
    }
  )
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
