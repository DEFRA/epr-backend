import { describe, expect, it } from 'vitest'
import { PROCESSING_TYPE_TABLES } from './index.js'
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

        it('has wasteBalanceRequiredFields array (for VAL011)', () => {
          expect(Array.isArray(schema.wasteBalanceRequiredFields)).toBe(true)
          expect(schema.wasteBalanceRequiredFields.length).toBeGreaterThan(0)
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
})
