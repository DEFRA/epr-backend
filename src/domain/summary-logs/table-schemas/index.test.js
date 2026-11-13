import { describe, expect, it } from 'vitest'
import {
  checkTemplateVersion,
  getTemplate,
  hasTemplate,
  hasTemplatesForYear,
  findSchemaByWasteRecordType,
  findSchemaForProcessingType,
  unfilledValuesForYear
} from './index.js'
import { PROCESSING_TYPES } from '../meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { DEFAULT_TEMPLATE_YEAR } from '../template-year.js'
import { EXPORTER_TEMPLATES } from './exporter/index.js'
import { EXPORTER_REGISTERED_ONLY_TEMPLATES } from './exporter-registered-only/index.js'
import { REPROCESSOR_INPUT_TEMPLATES } from './reprocessor-input/index.js'
import { REPROCESSOR_OUTPUT_TEMPLATES } from './reprocessor-output/index.js'
import { REPROCESSOR_REGISTERED_ONLY_TEMPLATES } from './reprocessor-registered-only/index.js'

import { toYear } from '#common/helpers/dates/year.js'

/** @param {string} processingType */
const tableSchemasOf = (processingType) =>
  getTemplate(DEFAULT_TEMPLATE_YEAR, processingType).tableSchemas

describe('table-schemas', () => {
  describe('2026 tables', () => {
    it.each(Object.values(PROCESSING_TYPES))(
      'has a template for %s',
      (processingType) => {
        expect(() =>
          getTemplate(DEFAULT_TEMPLATE_YEAR, processingType)
        ).not.toThrow()
      }
    )

    describe('REPROCESSOR_REGISTERED_ONLY', () => {
      const tableSchemas = tableSchemasOf(
        PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY
      )

      it('has RECEIVED_LOADS_FOR_REPROCESSING table', () => {
        expect(tableSchemas).toHaveProperty('RECEIVED_LOADS_FOR_REPROCESSING')
      })

      it('does not have REPROCESSED_LOADS table', () => {
        expect(tableSchemas).not.toHaveProperty('REPROCESSED_LOADS')
      })

      it('has SENT_ON_LOADS table', () => {
        expect(tableSchemas).toHaveProperty('SENT_ON_LOADS')
      })
    })

    describe('REPROCESSOR_INPUT', () => {
      const tableSchemas = tableSchemasOf(PROCESSING_TYPES.REPROCESSOR_INPUT)

      it('has RECEIVED_LOADS_FOR_REPROCESSING table', () => {
        expect(tableSchemas).toHaveProperty('RECEIVED_LOADS_FOR_REPROCESSING')
      })

      it('has REPROCESSED_LOADS table', () => {
        expect(tableSchemas).toHaveProperty('REPROCESSED_LOADS')
      })

      it('has SENT_ON_LOADS table', () => {
        expect(tableSchemas).toHaveProperty('SENT_ON_LOADS')
      })

      describe('RECEIVED_LOADS_FOR_REPROCESSING schema', () => {
        const schema = tableSchemas.RECEIVED_LOADS_FOR_REPROCESSING

        it('has rowIdField', () => {
          expect(schema.rowIdField).toBe('ROW_ID')
        })

        it('has requiredHeaders array', () => {
          expect(Array.isArray(schema.requiredHeaders)).toBe(true)
          expect(schema.requiredHeaders).toContain('ROW_ID')
        })

        it('has unfilledValues object', () => {
          expect(typeof schema.unfilledValues).toBe('object')
        })

        it('has validationSchema (Joi schema for VAL010)', () => {
          expect(schema.validationSchema).toBeDefined()
          expect(typeof schema.validationSchema.validate).toBe('function')
        })
      })
    })

    describe('REPROCESSOR_OUTPUT', () => {
      const tableSchemas = tableSchemasOf(PROCESSING_TYPES.REPROCESSOR_OUTPUT)

      it('has RECEIVED_LOADS_FOR_REPROCESSING table', () => {
        expect(tableSchemas).toHaveProperty('RECEIVED_LOADS_FOR_REPROCESSING')
      })

      it('has REPROCESSED_LOADS table', () => {
        expect(tableSchemas).toHaveProperty('REPROCESSED_LOADS')
      })

      it('has SENT_ON_LOADS table', () => {
        expect(tableSchemas).toHaveProperty('SENT_ON_LOADS')
      })
    })

    describe('EXPORTER', () => {
      const tableSchemas = tableSchemasOf(PROCESSING_TYPES.EXPORTER)

      it('has RECEIVED_LOADS_FOR_EXPORT table', () => {
        expect(tableSchemas).toHaveProperty('RECEIVED_LOADS_FOR_EXPORT')
      })

      it('has SENT_ON_LOADS table', () => {
        expect(tableSchemas).toHaveProperty('SENT_ON_LOADS')
      })
    })

    describe('EXPORTER_REGISTERED_ONLY', () => {
      const tableSchemas = tableSchemasOf(
        PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY
      )

      it('has RECEIVED_LOADS_FOR_EXPORT table', () => {
        expect(tableSchemas).toHaveProperty('RECEIVED_LOADS_FOR_EXPORT')
      })

      it('has LOADS_EXPORTED table', () => {
        expect(tableSchemas).toHaveProperty('LOADS_EXPORTED')
      })

      it('has SENT_ON_LOADS table', () => {
        expect(tableSchemas).toHaveProperty('SENT_ON_LOADS')
      })
    })
  })

  describe('findSchemaByWasteRecordType', () => {
    it('returns tableName and schema for a known waste record type', () => {
      const result = findSchemaByWasteRecordType(
        WASTE_RECORD_TYPE.RECEIVED,
        tableSchemasOf(PROCESSING_TYPES.REPROCESSOR_INPUT)
      )

      expect(result).not.toBeNull()
      const { tableName, schema } = /** @type {NonNullable<typeof result>} */ (
        result
      )
      expect(tableName).toBe('RECEIVED_LOADS_FOR_REPROCESSING')
      expect(schema.wasteRecordType).toBe(WASTE_RECORD_TYPE.RECEIVED)
      expect(schema.sheetName).toBe('Received')
    })

    it('returns the correct table for exported waste record type', () => {
      const result = findSchemaByWasteRecordType(
        WASTE_RECORD_TYPE.EXPORTED,
        tableSchemasOf(PROCESSING_TYPES.EXPORTER)
      )

      expect(result).not.toBeNull()
      const { tableName, schema } = /** @type {NonNullable<typeof result>} */ (
        result
      )
      expect(tableName).toBe('RECEIVED_LOADS_FOR_EXPORT')
      expect(schema.sheetName).toBe('Exported')
    })

    it('returns the correct table for processed waste record type', () => {
      const result = findSchemaByWasteRecordType(
        WASTE_RECORD_TYPE.PROCESSED,
        tableSchemasOf(PROCESSING_TYPES.REPROCESSOR_INPUT)
      )

      expect(result).not.toBeNull()
      const { tableName, schema } = /** @type {NonNullable<typeof result>} */ (
        result
      )
      expect(tableName).toBe('REPROCESSED_LOADS')
      expect(schema.sheetName).toBe('Processed')
    })

    it('returns the correct table for sent on waste record type', () => {
      const result = findSchemaByWasteRecordType(
        WASTE_RECORD_TYPE.SENT_ON,
        tableSchemasOf(PROCESSING_TYPES.REPROCESSOR_INPUT)
      )

      expect(result).not.toBeNull()
      const { tableName, schema } = /** @type {NonNullable<typeof result>} */ (
        result
      )
      expect(tableName).toBe('SENT_ON_LOADS')
      expect(schema.sheetName).toBe('Sent on')
    })

    it('returns null for an unknown waste record type', () => {
      const result = findSchemaByWasteRecordType(
        'unknownType',
        tableSchemasOf(PROCESSING_TYPES.REPROCESSOR_INPUT)
      )

      expect(result).toBeNull()
    })

    it('works with minimal table schemas', () => {
      const schema = {
        wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
        sheetName: 'Foo'
      }

      const result = findSchemaByWasteRecordType(WASTE_RECORD_TYPE.RECEIVED, {
        TABLE_1: schema
      })

      expect(result).toEqual({ tableName: 'TABLE_1', schema })
    })
  })

  describe('findSchemaForProcessingType', () => {
    it('finds REPROCESSOR_INPUT received loads schema by waste record type', () => {
      const result = findSchemaForProcessingType(
        PROCESSING_TYPES.REPROCESSOR_INPUT,
        WASTE_RECORD_TYPE.RECEIVED
      )

      expect(result).not.toBeNull()
      const schema = /** @type {NonNullable<typeof result>} */ (result)
      expect(schema.wasteRecordType).toBe(WASTE_RECORD_TYPE.RECEIVED)
      expect(schema.sheetName).toBe('Received')
    })

    it('finds EXPORTER exported loads schema by waste record type', () => {
      const result = findSchemaForProcessingType(
        PROCESSING_TYPES.EXPORTER,
        WASTE_RECORD_TYPE.EXPORTED
      )

      expect(result).not.toBeNull()
      const schema = /** @type {NonNullable<typeof result>} */ (result)
      expect(schema.wasteRecordType).toBe(WASTE_RECORD_TYPE.EXPORTED)
    })

    it('finds sent-on loads schema by waste record type', () => {
      const schema = findSchemaForProcessingType(
        PROCESSING_TYPES.REPROCESSOR_INPUT,
        WASTE_RECORD_TYPE.SENT_ON
      )

      expect(schema).not.toBeNull()
      expect(
        /** @type {NonNullable<typeof schema>} */ (schema).wasteRecordType
      ).toBe(WASTE_RECORD_TYPE.SENT_ON)
    })

    it('returns null for unknown processing type', () => {
      const schema = findSchemaForProcessingType(
        'UNKNOWN',
        WASTE_RECORD_TYPE.RECEIVED
      )

      expect(schema).toBeNull()
    })

    it('returns null for unknown waste record type', () => {
      const schema = findSchemaForProcessingType(
        PROCESSING_TYPES.REPROCESSOR_INPUT,
        'unknown'
      )

      expect(schema).toBeNull()
    })
  })

  describe('unfilledValuesForYear', () => {
    it('gathers the placeholders of every table in the 2026 templates', () => {
      const result = unfilledValuesForYear(DEFAULT_TEMPLATE_YEAR)

      // All dropdown fields use 'Choose option'
      expect(result.EWC_CODE).toContain('Choose option')
      expect(result.DESCRIPTION_WASTE).toContain('Choose option')
      expect(result.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE).toContain(
        'Choose option'
      )
      expect(result.BAILING_WIRE_PROTOCOL).toContain('Choose option')
      expect(result.HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION).toContain(
        'Choose option'
      )
      expect(result.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE).toContain(
        'Choose option'
      )
      expect(result.EXPORT_CONTROLS).toContain('Choose option')
      expect(result.ADD_PRODUCT_WEIGHT).toContain('Choose option')
      expect(result.END_OF_WASTE_STANDARDS).toContain('Choose option')
      expect(result.FINAL_DESTINATION_FACILITY_TYPE).toContain('Choose option')
      expect(result.BASEL_EXPORT_CODE).toContain('Choose option')
      expect(result.MONTH_RECEIVED_FOR_EXPORT).toContain('Choose option')
      expect(result.WAS_THE_WASTE_REFUSED).toContain('Choose option')
      expect(result.WAS_THE_WASTE_STOPPED).toContain('Choose option')
      expect(result.OSR_COUNTRY).toContain('Choose option')
    })

    it('throws for a year with no templates', () => {
      expect(() => unfilledValuesForYear(toYear(2028))).toThrow(
        'No summary log templates for 2028'
      )
    })
  })

  describe('templates by year', () => {
    it('has no templates for 2028', () => {
      expect(() =>
        getTemplate(toYear(2028), PROCESSING_TYPES.EXPORTER)
      ).toThrow()
    })

    it.each(Object.values(PROCESSING_TYPES))(
      'has a 2027 %s template accepting only version 2027.01',
      (processingType) => {
        expect(getTemplate(toYear(2027), processingType)).toMatchObject({
          minVersion: 2027.01,
          maxVersion: 2027.01
        })
      }
    )

    it.each([
      [PROCESSING_TYPES.EXPORTER, 5, EXPORTER_TEMPLATES],
      [
        PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY,
        2.1,
        EXPORTER_REGISTERED_ONLY_TEMPLATES
      ],
      [PROCESSING_TYPES.REPROCESSOR_INPUT, 5, REPROCESSOR_INPUT_TEMPLATES],
      [PROCESSING_TYPES.REPROCESSOR_OUTPUT, 5, REPROCESSOR_OUTPUT_TEMPLATES],
      [
        PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY,
        2.1,
        REPROCESSOR_REGISTERED_ONLY_TEMPLATES
      ]
    ])(
      'has a 2026 %s template with minimum version %s and its tableSchemas',
      (processingType, minVersion, templatesByYear) => {
        const template = getTemplate(DEFAULT_TEMPLATE_YEAR, processingType)
        expect(template).toBe(templatesByYear[2026])
        expect(template.minVersion).toBe(minVersion)
      }
    )
  })

  describe('hasTemplate', () => {
    it.each([
      [2026, PROCESSING_TYPES.EXPORTER, true],
      [2027, PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY, true],
      [2028, PROCESSING_TYPES.EXPORTER, false],
      [2026, 'UNKNOWN', false]
    ])('is %s %s: %s', (year, processingType, expected) => {
      expect(hasTemplate(toYear(year), processingType)).toBe(expected)
    })
  })

  describe('hasTemplatesForYear', () => {
    it.each([
      [2025, false],
      [2026, true],
      [2027, true],
      [2028, false]
    ])('for %s is %s', (year, expected) => {
      expect(hasTemplatesForYear(toYear(year))).toBe(expected)
    })
  })

  describe('checkTemplateVersion', () => {
    const check = (version, year = DEFAULT_TEMPLATE_YEAR) =>
      checkTemplateVersion({
        year,
        processingType: PROCESSING_TYPES.EXPORTER,
        version
      })

    it.each([5, 5.5])('accepts version %s for 2026', (version) => {
      expect(check(version)).toBeNull()
    })

    it('rejects a version below the minimum with the minimum', () => {
      expect(check(4)).toEqual({
        error: 'number.min',
        context: { limit: 5 }
      })
    })

    it('accepts version 2027.01 for 2027', () => {
      expect(check(2027.01, toYear(2027))).toBeNull()
    })

    it.each([2027.02, 2027.1])(
      'rejects version %s for 2027 with the maximum',
      (version) => {
        expect(check(version, toYear(2027))).toEqual({
          error: 'number.max',
          context: { limit: 2027.01 }
        })
      }
    )

    it('rejects a version below the 2027 minimum with the minimum', () => {
      expect(check(2027, toYear(2027))).toEqual({
        error: 'number.min',
        context: { limit: 2027.01 }
      })
    })

    it('rejects a version for a year with no template', () => {
      expect(check(2028.01, toYear(2028))).toEqual({
        error: 'templateVersion.year'
      })
    })

    it('rejects a version for a year with no template before the year mismatch', () => {
      expect(check(2028.01)).toEqual({ error: 'templateVersion.year' })
    })

    it.each([
      [5, 2027, 2026],
      [2027.01, 2026, 2027]
    ])(
      'rejects version %s in a %s summary log as a year mismatch with a %s template',
      (version, year, actualYear) => {
        expect(check(version, toYear(year))).toEqual({
          error: 'templateVersion.yearMismatch',
          context: { year, actualYear }
        })
      }
    )

    it('rejects an unknown processing type as having no template', () => {
      expect(
        checkTemplateVersion({
          year: DEFAULT_TEMPLATE_YEAR,
          processingType: 'UNKNOWN',
          version: 5
        })
      ).toEqual({ error: 'templateVersion.year' })
    })
  })

  describe('getTemplate', () => {
    it('returns the template for a year and processing type', () => {
      expect(
        getTemplate(DEFAULT_TEMPLATE_YEAR, PROCESSING_TYPES.EXPORTER)
      ).toBe(EXPORTER_TEMPLATES[2026])
    })

    it('throws for a year with no templates', () => {
      expect(() =>
        getTemplate(toYear(2028), PROCESSING_TYPES.EXPORTER)
      ).toThrow('No EXPORTER summary log template for 2028')
    })

    it('throws for an unknown processing type', () => {
      expect(() => getTemplate(DEFAULT_TEMPLATE_YEAR, 'UNKNOWN')).toThrow(
        'No UNKNOWN summary log template for 2026'
      )
    })
  })
})
