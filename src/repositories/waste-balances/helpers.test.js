import { describe, it, expect, vi } from 'vitest'
import {
  findOrCreateWasteBalance,
  performUpdateWasteBalanceTransactions,
  filterValidRecords
} from './helpers.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import {
  WASTE_BALANCE_TRANSACTION_TYPE,
  WASTE_BALANCE_TRANSACTION_ENTITY_TYPE
} from '#domain/waste-balances/model.js'
import * as validationPipeline from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import * as tableSchemas from '#domain/summary-logs/table-schemas/index.js'
import { RECEIVED_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/exporter/fields.js'

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

    it('should include record when outcome is missing and processingType is not available', () => {
      const record = {
        record: {
          organisationId: 'org-1',
          type: WASTE_RECORD_TYPE.EXPORTED,
          data: {}
        }
        // outcome missing
      }

      const result = filterValidRecords([record])

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(record.record)
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

      // Mock validation to return INCLUDED
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

      const result = filterValidRecords([sentOnRecord])

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(sentOnRecord.record)

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
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
      const promise = performUpdateWasteBalanceTransactions({
        wasteRecords: [{ record: { data: {} } }],
        accreditationId: 'acc-1',
        dependencies: {},
        findBalance: vi.fn(),
        saveBalance: vi.fn()
      })

      await expect(promise).rejects.toThrow(
        'organisationsRepository dependency is required'
      )
    })

    it('should throw error if accreditation is not found', async () => {
      const organisationsRepository = {
        findAccreditationById: vi.fn().mockResolvedValue(null)
      }

      const promise = performUpdateWasteBalanceTransactions({
        wasteRecords: [{ record: { organisationId: 'org-1', data: {} } }],
        accreditationId: 'acc-1',
        dependencies: { organisationsRepository },
        findBalance: vi.fn(),
        saveBalance: vi.fn()
      })

      await expect(promise).rejects.toThrow('Accreditation not found: acc-1')
    })

    it('should update balance when new transactions are created', async () => {
      const accreditation = { validFrom: '2023-01-01', validTo: '2023-12-31' }
      const organisationsRepository = {
        findAccreditationById: vi.fn().mockResolvedValue(accreditation)
      }
      const existingBalance = {
        id: 'bal-1',
        organisationId: 'org-1',
        accreditationId: 'acc-1',
        amount: 0,
        availableAmount: 0,
        transactions: [],
        version: 1
      }
      const findBalance = vi.fn().mockResolvedValue(existingBalance)
      const saveBalance = vi.fn().mockResolvedValue()

      const wasteRecords = [
        {
          record: {
            organisationId: 'org-1',
            rowId: 'row-1',
            type: WASTE_RECORD_TYPE.EXPORTED,
            data: {
              processingType: PROCESSING_TYPES.EXPORTER,
              [RECEIVED_LOADS_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]:
                'No',
              [RECEIVED_LOADS_FIELDS.DATE_OF_EXPORT]: '2023-06-01',
              [RECEIVED_LOADS_FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]:
                'No',
              [RECEIVED_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: 10,
              [RECEIVED_LOADS_FIELDS.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR]: 0
            }
          }
        }
      ]

      // Mock validation to return INCLUDED
      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      const createTableSchemaGetterSpy = vi.spyOn(
        tableSchemas,
        'createTableSchemaGetter'
      )

      createTableSchemaGetterSpy.mockReturnValue(() => ({}))
      classifyRowSpy.mockReturnValue({ outcome: ROW_OUTCOME.INCLUDED })

      await performUpdateWasteBalanceTransactions({
        wasteRecords,
        accreditationId: 'acc-1',
        dependencies: { organisationsRepository },
        findBalance,
        saveBalance
      })

      expect(saveBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 10,
          availableAmount: 10,
          version: 2
        }),
        expect.arrayContaining([
          expect.objectContaining({
            amount: 10,
            type: WASTE_BALANCE_TRANSACTION_TYPE.CREDIT
          })
        ])
      )

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })

    it('should return early if no new transactions are created', async () => {
      const accreditation = { validFrom: '2023-01-01', validTo: '2023-12-31' }
      const organisationsRepository = {
        findAccreditationById: vi.fn().mockResolvedValue(accreditation)
      }
      const existingBalance = {
        id: 'bal-1',
        organisationId: 'org-1',
        accreditationId: 'acc-1',
        amount: 10,
        availableAmount: 10,
        transactions: [
          {
            amount: 10,
            type: WASTE_BALANCE_TRANSACTION_TYPE.CREDIT,
            entities: [
              {
                id: 'row-1',
                type: WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.WASTE_RECORD_RECEIVED
              }
            ]
          }
        ],
        version: 1
      }
      const findBalance = vi.fn().mockResolvedValue(existingBalance)
      const saveBalance = vi.fn()

      const wasteRecords = [
        {
          record: {
            organisationId: 'org-1',
            rowId: 'row-1',
            type: WASTE_RECORD_TYPE.EXPORTED,
            data: {
              processingType: PROCESSING_TYPES.EXPORTER,
              [RECEIVED_LOADS_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]:
                'No',
              [RECEIVED_LOADS_FIELDS.DATE_OF_EXPORT]: '2023-06-01',
              [RECEIVED_LOADS_FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]:
                'No',
              [RECEIVED_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: 10,
              [RECEIVED_LOADS_FIELDS.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR]: 0
            }
          }
        }
      ]

      // Mock validation to return INCLUDED
      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      const createTableSchemaGetterSpy = vi.spyOn(
        tableSchemas,
        'createTableSchemaGetter'
      )

      createTableSchemaGetterSpy.mockReturnValue(() => ({}))
      classifyRowSpy.mockReturnValue({ outcome: ROW_OUTCOME.INCLUDED })

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

    it('should handle records without .record property', async () => {
      const reprocessorRecord = {
        organisationId: 'org-1',
        rowId: 'row-1',
        type: WASTE_RECORD_TYPE.EXPORTED,
        data: {
          processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
        }
      }

      const result = filterValidRecords([reprocessorRecord])

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(reprocessorRecord)
    })

    it('should throw error if accreditationId is invalid', async () => {
      await expect(
        performUpdateWasteBalanceTransactions({
          wasteRecords: [{ record: { data: { processingType: 'Exporter' } } }],
          accreditationId: '', // Invalid
          dependencies: {},
          findBalance: vi.fn(),
          saveBalance: vi.fn()
        })
      ).rejects.toThrow()
    })

    it('should handle missing transactions and version in existing balance', async () => {
      const accreditation = { validFrom: '2023-01-01', validTo: '2023-12-31' }
      const organisationsRepository = {
        findAccreditationById: vi.fn().mockResolvedValue(accreditation)
      }
      const existingBalance = {
        id: 'bal-1',
        organisationId: 'org-1',
        accreditationId: 'acc-1',
        amount: 0,
        availableAmount: 0
        // transactions and version missing
      }
      const findBalance = vi.fn().mockResolvedValue(existingBalance)
      const saveBalance = vi.fn().mockResolvedValue()

      const wasteRecords = [
        {
          record: {
            organisationId: 'org-1',
            rowId: 'row-1',
            type: WASTE_RECORD_TYPE.EXPORTED,
            data: {
              processingType: PROCESSING_TYPES.EXPORTER,
              [RECEIVED_LOADS_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]:
                'No',
              [RECEIVED_LOADS_FIELDS.DATE_OF_EXPORT]: '2023-06-01',
              [RECEIVED_LOADS_FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]:
                'No',
              [RECEIVED_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: 10,
              [RECEIVED_LOADS_FIELDS.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR]: 0
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

      await performUpdateWasteBalanceTransactions({
        wasteRecords,
        accreditationId: 'acc-1',
        dependencies: { organisationsRepository },
        findBalance,
        saveBalance
      })

      expect(saveBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 1,
          transactions: expect.arrayContaining([
            expect.objectContaining({ amount: 10 })
          ])
        }),
        expect.any(Array)
      )

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })
  })
})
