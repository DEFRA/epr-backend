import { describe, it, expect, vi } from 'vitest'
import {
  findOrCreateWasteBalance,
  performUpdateWasteBalanceTransactions,
  filterValidRecords
} from './helpers.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import * as validationPipeline from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import * as tableSchemas from '#domain/summary-logs/table-schemas/index.js'

describe('src/repositories/waste-balances/helpers.js', () => {
  describe('filterValidRecords', () => {
    it('should return empty array when wasteRecords is empty', () => {
      const result = filterValidRecords([])
      expect(result).toEqual([])
    })

    it('should include all records when processingType is not available', () => {
      const record1 = {
        organisationId: 'org-1',
        type: WASTE_RECORD_TYPE.EXPORTED,
        data: {} // no processingType
      }
      const record2 = {
        organisationId: 'org-1',
        type: WASTE_RECORD_TYPE.EXPORTED,
        data: {} // no processingType
      }

      const result = filterValidRecords([record1, record2])

      expect(result).toHaveLength(2)
      expect(result[0]).toBe(record1)
      expect(result[1]).toBe(record2)
    })

    it('should handle SENT_ON record type for exporters', () => {
      const sentOnRecord = {
        organisationId: 'org-1',
        type: WASTE_RECORD_TYPE.SENT_ON,
        data: {
          processingType: PROCESSING_TYPES.EXPORTER
        }
      }

      // Mock validation to return INCLUDED
      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      const createTableSchemaGetterSpy = vi.spyOn(
        tableSchemas,
        'createTableSchemaGetter'
      )

      createTableSchemaGetterSpy.mockReturnValue(() => ({}))
      classifyRowSpy.mockReturnValue({ outcome: ROW_OUTCOME.INCLUDED })

      const result = filterValidRecords([sentOnRecord])

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(sentOnRecord)

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })

    it('should include record when exporter has unknown record type (no matching schema)', () => {
      const unknownTypeRecord = {
        organisationId: 'org-1',
        type: 'unknown-type',
        data: {
          processingType: PROCESSING_TYPES.EXPORTER
        }
      }

      // No mocking needed - the real getTableName returns null for unknown types
      // and the record should be included when no schema is found
      const result = filterValidRecords([unknownTypeRecord])

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(unknownTypeRecord)
    })

    it('should include record when processingType is not EXPORTER (no schema lookup)', () => {
      const reprocessorRecord = {
        organisationId: 'org-1',
        type: WASTE_RECORD_TYPE.EXPORTED,
        data: {
          processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
        }
      }

      // For non-exporter processing types, getTableName returns null
      // so no schema validation occurs and record is included
      const result = filterValidRecords([reprocessorRecord])

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(reprocessorRecord)
    })

    it('should handle PROCESSED record type for reprocessor output', () => {
      const processedRecord = {
        record: {
          organisationId: 'org-1',
          type: WASTE_RECORD_TYPE.PROCESSED,
          data: {
            processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT
          }
        }
      }

      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      const createTableSchemaGetterSpy = vi.spyOn(
        tableSchemas,
        'createTableSchemaGetter'
      )

      createTableSchemaGetterSpy.mockReturnValue(() => ({}))
      classifyRowSpy.mockReturnValue({ outcome: ROW_OUTCOME.INCLUDED })

      const result = filterValidRecords([processedRecord])

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(processedRecord.record)

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })

    it('should handle SENT_ON record type for reprocessor output', () => {
      const sentOnRecord = {
        record: {
          organisationId: 'org-1',
          type: WASTE_RECORD_TYPE.SENT_ON,
          data: {
            processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT
          }
        }
      }

      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      const createTableSchemaGetterSpy = vi.spyOn(
        tableSchemas,
        'createTableSchemaGetter'
      )

      createTableSchemaGetterSpy.mockReturnValue(() => ({}))
      classifyRowSpy.mockReturnValue({ outcome: ROW_OUTCOME.INCLUDED })

      const result = filterValidRecords([sentOnRecord])

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(sentOnRecord.record)

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })

    it('should handle RECEIVED record type for reprocessor input', () => {
      const receivedRecord = {
        record: {
          organisationId: 'org-1',
          type: WASTE_RECORD_TYPE.RECEIVED,
          data: {
            processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
          }
        }
      }

      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      const createTableSchemaGetterSpy = vi.spyOn(
        tableSchemas,
        'createTableSchemaGetter'
      )

      createTableSchemaGetterSpy.mockReturnValue(() => ({}))
      classifyRowSpy.mockReturnValue({ outcome: ROW_OUTCOME.INCLUDED })

      const result = filterValidRecords([receivedRecord])

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(receivedRecord.record)

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })

    it('should handle EXPORTED record type for exporters', () => {
      const exportedRecord = {
        record: {
          organisationId: 'org-1',
          type: WASTE_RECORD_TYPE.EXPORTED,
          data: {
            processingType: PROCESSING_TYPES.EXPORTER
          }
        }
      }

      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      const createTableSchemaGetterSpy = vi.spyOn(
        tableSchemas,
        'createTableSchemaGetter'
      )

      createTableSchemaGetterSpy.mockReturnValue(() => ({}))
      classifyRowSpy.mockReturnValue({ outcome: ROW_OUTCOME.INCLUDED })

      const result = filterValidRecords([exportedRecord])

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(exportedRecord.record)

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })

    it('should include record when processingType is completely unknown', () => {
      const unknownProcRecord = {
        record: {
          organisationId: 'org-1',
          type: WASTE_RECORD_TYPE.EXPORTED,
          data: {
            processingType: 'completely-unknown'
          }
        }
      }

      const result = filterValidRecords([unknownProcRecord])

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(unknownProcRecord.record)
    })

    it('should handle SENT_ON record type for reprocessor input', () => {
      const sentOnRecord = {
        record: {
          organisationId: 'org-1',
          type: WASTE_RECORD_TYPE.SENT_ON,
          data: {
            processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
          }
        }
      }

      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      const createTableSchemaGetterSpy = vi.spyOn(
        tableSchemas,
        'createTableSchemaGetter'
      )

      createTableSchemaGetterSpy.mockReturnValue(() => ({}))
      classifyRowSpy.mockReturnValue({ outcome: ROW_OUTCOME.INCLUDED })

      const result = filterValidRecords([sentOnRecord])

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(sentOnRecord.record)

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })

    it('should handle unknown record type for reprocessor output', () => {
      const unknownRecord = {
        record: {
          organisationId: 'org-1',
          type: 'UNKNOWN',
          data: {
            processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT
          }
        }
      }

      const result = filterValidRecords([unknownRecord])

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(unknownRecord.record)
    })

    it('should use pre-calculated outcome when outcome is present', () => {
      const wasteRecords = [
        {
          record: { type: 'SOME_TYPE' },
          outcome: ROW_OUTCOME.INCLUDED
        },
        {
          record: { type: 'SOME_TYPE' },
          outcome: 'EXCLUDED'
        }
      ]
      const result = filterValidRecords(wasteRecords)
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('SOME_TYPE')
    })
  })

  describe('findOrCreateWasteBalance', () => {
    it('should return existing balance if found', async () => {
      const mockBalance = { id: 'balance-1' }
      const findBalance = vi.fn().mockResolvedValue(mockBalance)

      const result = await findOrCreateWasteBalance({
        findBalance,
        accreditationId: 'acc-1',
        organisationId: 'org-1',
        shouldCreate: true
      })

      expect(result).toBe(mockBalance)
      expect(findBalance).toHaveBeenCalledWith('acc-1')
    })

    it('should create new balance if not found and shouldCreate is true', async () => {
      const findBalance = vi.fn().mockResolvedValue(null)

      const result = await findOrCreateWasteBalance({
        findBalance,
        accreditationId: 'acc-1',
        organisationId: 'org-1',
        shouldCreate: true
      })

      expect(result).toEqual(
        expect.objectContaining({
          accreditationId: 'acc-1',
          organisationId: 'org-1',
          transactions: [],
          amount: 0,
          availableAmount: 0,
          version: 0,
          schemaVersion: 1
        })
      )
      expect(result.id).toBeDefined()
    })

    it('should return null if not found and shouldCreate is false', async () => {
      const findBalance = vi.fn().mockResolvedValue(null)

      const result = await findOrCreateWasteBalance({
        findBalance,
        accreditationId: 'acc-1',
        organisationId: 'org-1',
        shouldCreate: false
      })

      expect(result).toBeNull()
    })
  })

  describe('performUpdateWasteBalanceTransactions', () => {
    it('should return early if wasteRecords is empty', async () => {
      const result = await performUpdateWasteBalanceTransactions({
        wasteRecords: [],
        accreditationId: 'acc-1',
        dependencies: {
          organisationsRepository: {}
        },
        findBalance: vi.fn(),
        saveBalance: vi.fn()
      })

      expect(result).toBeUndefined()
    })
  })
})
