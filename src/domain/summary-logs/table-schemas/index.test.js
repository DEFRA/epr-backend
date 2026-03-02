import { describe, expect, it } from 'vitest'
import { PROCESSING_TYPE_TABLES, aggregateUnfilledValues } from './index.js'
import { PROCESSING_TYPES } from '../meta-fields.js'

describe('table-schemas', () => {
  describe('PROCESSING_TYPE_TABLES', () => {
    it('exports a registry object', () => {
      expect(PROCESSING_TYPE_TABLES).toBeDefined()
      expect(typeof PROCESSING_TYPE_TABLES).toBe('object')
    })

    it('has entries for all processing types', () => {
      expect(PROCESSING_TYPE_TABLES).toHaveProperty(
        PROCESSING_TYPES.REPROCESSOR_INPUT
      )
      expect(PROCESSING_TYPE_TABLES).toHaveProperty(
        PROCESSING_TYPES.REPROCESSOR_OUTPUT
      )
      expect(PROCESSING_TYPE_TABLES).toHaveProperty(PROCESSING_TYPES.EXPORTER)
    })

    describe('REPROCESSOR_INPUT', () => {
      const tables = PROCESSING_TYPE_TABLES[PROCESSING_TYPES.REPROCESSOR_INPUT]

      it('has RECEIVED_LOADS_FOR_REPROCESSING table', () => {
        expect(tables).toHaveProperty('RECEIVED_LOADS_FOR_REPROCESSING')
      })

      it('has REPROCESSED_LOADS table', () => {
        expect(tables).toHaveProperty('REPROCESSED_LOADS')
      })

      it('has SENT_ON_LOADS table', () => {
        expect(tables).toHaveProperty('SENT_ON_LOADS')
      })

      describe('RECEIVED_LOADS_FOR_REPROCESSING schema', () => {
        const schema = tables.RECEIVED_LOADS_FOR_REPROCESSING

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

        it('has fieldsRequiredForInclusionInWasteBalance array (for VAL011)', () => {
          expect(
            Array.isArray(schema.fieldsRequiredForInclusionInWasteBalance)
          ).toBe(true)
          expect(
            schema.fieldsRequiredForInclusionInWasteBalance.length
          ).toBeGreaterThan(0)
        })
      })
    })

    describe('REPROCESSOR_OUTPUT', () => {
      const tables = PROCESSING_TYPE_TABLES[PROCESSING_TYPES.REPROCESSOR_OUTPUT]

      it('has RECEIVED_LOADS_FOR_REPROCESSING table', () => {
        expect(tables).toHaveProperty('RECEIVED_LOADS_FOR_REPROCESSING')
      })

      it('has REPROCESSED_LOADS table', () => {
        expect(tables).toHaveProperty('REPROCESSED_LOADS')
      })

      it('has SENT_ON_LOADS table', () => {
        expect(tables).toHaveProperty('SENT_ON_LOADS')
      })
    })

    describe('EXPORTER', () => {
      const tables = PROCESSING_TYPE_TABLES[PROCESSING_TYPES.EXPORTER]

      it('has RECEIVED_LOADS_FOR_EXPORT table', () => {
        expect(tables).toHaveProperty('RECEIVED_LOADS_FOR_EXPORT')
      })

      it('has SENT_ON_LOADS table', () => {
        expect(tables).toHaveProperty('SENT_ON_LOADS')
      })
    })
  })

  describe('aggregateUnfilledValues', () => {
    it('returns empty object for registry with no unfilledValues', () => {
      const registry = {
        TYPE_A: {
          TABLE_1: { unfilledValues: {} }
        }
      }

      expect(aggregateUnfilledValues(registry)).toEqual({})
    })

    it('collects unfilledValues from a single schema', () => {
      const registry = {
        TYPE_A: {
          TABLE_1: {
            unfilledValues: {
              DROPDOWN: ['Choose option']
            }
          }
        }
      }

      expect(aggregateUnfilledValues(registry)).toEqual({
        DROPDOWN: ['Choose option']
      })
    })

    it('merges unfilledValues across schemas and processing types', () => {
      const registry = {
        TYPE_A: {
          TABLE_1: {
            unfilledValues: { FIELD_A: ['Choose option'] }
          }
        },
        TYPE_B: {
          TABLE_2: {
            unfilledValues: { FIELD_B: ['Choose option'] }
          }
        }
      }

      expect(aggregateUnfilledValues(registry)).toEqual({
        FIELD_A: ['Choose option'],
        FIELD_B: ['Choose option']
      })
    })

    it('deduplicates values for the same field across schemas', () => {
      const registry = {
        TYPE_A: {
          TABLE_1: {
            unfilledValues: { DROPDOWN: ['Choose option'] }
          }
        },
        TYPE_B: {
          TABLE_2: {
            unfilledValues: { DROPDOWN: ['Choose option'] }
          }
        }
      }

      expect(aggregateUnfilledValues(registry)).toEqual({
        DROPDOWN: ['Choose option']
      })
    })

    it('merges distinct values for the same field across schemas', () => {
      const registry = {
        TYPE_A: {
          TABLE_1: {
            unfilledValues: { DROPDOWN: ['Choose option'] }
          }
        },
        TYPE_B: {
          TABLE_2: {
            unfilledValues: { DROPDOWN: ['Select one'] }
          }
        }
      }

      expect(aggregateUnfilledValues(registry)).toEqual({
        DROPDOWN: ['Choose option', 'Select one']
      })
    })

    it('produces correct result for the real PROCESSING_TYPE_TABLES registry', () => {
      const result = aggregateUnfilledValues(PROCESSING_TYPE_TABLES)

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
    })
  })
})
