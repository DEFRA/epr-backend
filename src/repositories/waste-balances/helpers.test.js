import { describe, it, expect, vi } from 'vitest'
import {
  findOrCreateWasteBalance,
  performUpdateWasteBalanceTransactions,
  filterValidRecords
} from './helpers.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { REPROCESSOR_INPUT_FIELD } from '#domain/waste-balances/constants.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import * as validationPipeline from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import * as tableSchemas from '#domain/summary-logs/table-schemas/index.js'

describe('src/repositories/waste-balances/helpers.js', () => {
  describe('filterValidRecords', () => {
    it('should return empty array when wasteRecords is empty', () => {
      const result = filterValidRecords([])
      expect(result).toEqual([])
    })

    it('should use pre-calculated outcome when processingType is not available', () => {
      const includedRecord = {
        record: {
          organisationId: 'org-1',
          type: WASTE_RECORD_TYPE.EXPORTED,
          data: {} // no processingType
        },
        outcome: ROW_OUTCOME.INCLUDED
      }
      const excludedRecord = {
        record: {
          organisationId: 'org-1',
          type: WASTE_RECORD_TYPE.EXPORTED,
          data: {} // no processingType
        },
        outcome: ROW_OUTCOME.EXCLUDED
      }

      const result = filterValidRecords([includedRecord, excludedRecord])

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(includedRecord.record)
    })

    it('should handle SENT_ON record type for exporters', () => {
      const sentOnRecord = {
        record: {
          organisationId: 'org-1',
          type: WASTE_RECORD_TYPE.SENT_ON,
          data: {
            processingType: PROCESSING_TYPES.EXPORTER
          }
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

      const result = filterValidRecords(
        [sentOnRecord],
        PROCESSING_TYPES.EXPORTER
      )

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(sentOnRecord.record)

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })

    it('should handle RECEIVED record type for reprocessors', () => {
      const record = {
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

      const result = filterValidRecords(
        [record],
        PROCESSING_TYPES.REPROCESSOR_INPUT
      )

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(record.record)

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })

    it('should handle SENT_ON record type for reprocessors', () => {
      const record = {
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

      const result = filterValidRecords(
        [record],
        PROCESSING_TYPES.REPROCESSOR_INPUT
      )

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(record.record)

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })

    it('should handle EXPORTED record type for exporters', () => {
      const record = {
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

      const result = filterValidRecords([record], PROCESSING_TYPES.EXPORTER)

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(record.record)

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })

    it('should handle SENT_ON record type for exporters', () => {
      const record = {
        record: {
          organisationId: 'org-1',
          type: WASTE_RECORD_TYPE.SENT_ON,
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

      const result = filterValidRecords([record], PROCESSING_TYPES.EXPORTER)

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(record.record)

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })

    it('should handle RECEIVED record type for reprocessor output', () => {
      const record = {
        record: {
          organisationId: 'org-1',
          type: WASTE_RECORD_TYPE.RECEIVED,
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

      const result = filterValidRecords(
        [record],
        PROCESSING_TYPES.REPROCESSOR_OUTPUT
      )

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(record.record)

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })

    it('should handle records without outcome', () => {
      const record = {
        record: {
          organisationId: 'org-1',
          type: WASTE_RECORD_TYPE.SENT_ON,
          data: {
            // no processingType to make getTableSchema null
          }
        }
        // outcome missing
      }

      const result = filterValidRecords([record])

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(record.record)
    })

    it('should include record when exporter has unknown record type (no matching schema)', () => {
      const unknownTypeRecord = {
        record: {
          organisationId: 'org-1',
          type: 'unknown-type',
          data: {
            processingType: PROCESSING_TYPES.EXPORTER
          }
        }
      }

      // No mocking needed - the real getTableName returns null for unknown types
      // and the record should be included when no schema is found
      const result = filterValidRecords([unknownTypeRecord])

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(unknownTypeRecord.record)
    })

    it('should include record when processingType is not EXPORTER (no schema lookup)', () => {
      const reprocessorRecord = {
        record: {
          organisationId: 'org-1',
          type: WASTE_RECORD_TYPE.EXPORTED,
          data: {
            processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
          }
        }
      }

      // For non-exporter processing types, getTableName returns null
      // so no schema validation occurs and record is included
      const result = filterValidRecords([reprocessorRecord])

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(reprocessorRecord.record)
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

    it('should throw error if organisationsRepository is missing', async () => {
      await expect(
        performUpdateWasteBalanceTransactions({
          wasteRecords: [{ record: { organisationId: 'org-1' } }],
          accreditationId: 'acc-1',
          dependencies: {},
          findBalance: vi.fn(),
          saveBalance: vi.fn()
        })
      ).rejects.toThrow('organisationsRepository dependency is required')
    })

    it('should throw error if accreditation is not found', async () => {
      const organisationsRepository = {
        findAccreditationById: vi.fn().mockResolvedValue(null)
      }
      await expect(
        performUpdateWasteBalanceTransactions({
          wasteRecords: [{ record: { organisationId: 'org-1' } }],
          accreditationId: 'acc-1',
          dependencies: { organisationsRepository },
          findBalance: vi.fn(),
          saveBalance: vi.fn()
        })
      ).rejects.toThrow('Accreditation not found: acc-1')
    })

    it('should throw error if accreditationId is invalid', async () => {
      await expect(
        performUpdateWasteBalanceTransactions({
          wasteRecords: [{ record: { organisationId: 'org-1' } }],
          accreditationId: 123, // Not a string
          dependencies: { organisationsRepository: {} },
          findBalance: vi.fn(),
          saveBalance: vi.fn()
        })
      ).rejects.toThrow()
    })

    it('should handle REPROCESSOR_OUTPUT processing type', () => {
      const record = {
        record: {
          organisationId: 'org-1',
          type: WASTE_RECORD_TYPE.RECEIVED,
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

      const result = filterValidRecords(
        [record],
        PROCESSING_TYPES.REPROCESSOR_OUTPUT
      )

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(record.record)

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })

    it('should handle SENT_ON for REPROCESSOR_OUTPUT', () => {
      const record = {
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

      const result = filterValidRecords(
        [record],
        PROCESSING_TYPES.REPROCESSOR_OUTPUT
      )

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(record.record)

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })

    it('should update waste balance with new transactions', async () => {
      const wasteRecords = [
        {
          record: {
            rowId: 'row-1',
            organisationId: 'org-1',
            type: WASTE_RECORD_TYPE.RECEIVED,
            data: {
              processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
              [REPROCESSOR_INPUT_FIELD.RECEIVED_TONNAGE]: 100,
              [REPROCESSOR_INPUT_FIELD.DATE_RECEIVED]: '2023-01-01'
            }
          }
        }
      ]

      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      const createTableSchemaGetterSpy = vi.spyOn(
        tableSchemas,
        'createTableSchemaGetter'
      )
      createTableSchemaGetterSpy.mockReturnValue(() => ({}))
      classifyRowSpy.mockReturnValue({ outcome: ROW_OUTCOME.INCLUDED })

      const accreditation = {
        id: 'acc-1',
        status: 'active',
        validFrom: '2023-01-01',
        validTo: '2023-12-31'
      }
      const organisationsRepository = {
        findAccreditationById: vi.fn().mockResolvedValue(accreditation)
      }
      const existingBalance = {
        id: 'balance-1',
        accreditationId: 'acc-1',
        organisationId: 'org-1',
        amount: 50,
        availableAmount: 50,
        transactions: [],
        version: 1
      }
      const findBalance = vi.fn().mockResolvedValue(existingBalance)
      const saveBalance = vi.fn().mockResolvedValue()

      await performUpdateWasteBalanceTransactions({
        wasteRecords,
        accreditationId: 'acc-1',
        dependencies: { organisationsRepository },
        findBalance,
        saveBalance
      })

      expect(saveBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 150,
          availableAmount: 150,
          version: 2
        }),
        expect.arrayContaining([
          expect.objectContaining({
            amount: 100,
            type: 'credit'
          })
        ])
      )

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })

    it('should return early if no new transactions are calculated', async () => {
      const wasteRecords = [
        {
          record: {
            rowId: 'row-1',
            organisationId: 'org-1',
            type: WASTE_RECORD_TYPE.RECEIVED,
            data: {
              processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
              [REPROCESSOR_INPUT_FIELD.RECEIVED_TONNAGE]: 100,
              [REPROCESSOR_INPUT_FIELD.DATE_RECEIVED]: '2022-01-01' // Outside range
            }
          }
        }
      ]

      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      const createTableSchemaGetterSpy = vi.spyOn(
        tableSchemas,
        'createTableSchemaGetter'
      )
      createTableSchemaGetterSpy.mockReturnValue(() => ({}))
      classifyRowSpy.mockReturnValue({ outcome: ROW_OUTCOME.INCLUDED })

      const accreditation = {
        id: 'acc-1',
        status: 'active',
        validFrom: '2023-01-01',
        validTo: '2023-12-31'
      }
      const organisationsRepository = {
        findAccreditationById: vi.fn().mockResolvedValue(accreditation)
      }
      const existingBalance = {
        id: 'balance-1',
        accreditationId: 'acc-1',
        organisationId: 'org-1',
        amount: 50,
        availableAmount: 50,
        transactions: [],
        version: 1
      }
      const findBalance = vi.fn().mockResolvedValue(existingBalance)
      const saveBalance = vi.fn()

      await performUpdateWasteBalanceTransactions({
        wasteRecords,
        accreditationId: 'acc-1',
        dependencies: { organisationsRepository },
        findBalance,
        saveBalance
      })

      expect(saveBalance).not.toHaveBeenCalled()

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })
  })
})
