import { describe, expect, it } from 'vitest'
import {
  SECTION_DATE_FIELDS_BY_OPERATOR_CATEGORY,
  TONNAGE_RECEIVED_FIELD_BY_OPERATOR_CATEGORY
} from './aggregation/fields-by-operator-category.js'

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
      overseasSites: 'DATE_RECEIVED_BY_OSR',
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
      overseasSites: 'DATE_OF_EXPORT',
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
