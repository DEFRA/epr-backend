import Boom from '@hapi/boom'
import { describe, it, expect, vi } from 'vitest'
import {
  findOrCreateWasteBalance,
  performUpdateWasteBalanceTransactions,
  annotateRecordsWithExclusion,
  buildPrnCreationTransaction,
  performDeductAvailableBalanceForPrnCreation,
  buildPrnIssuedTransaction,
  performDeductTotalBalanceForPrnIssue,
  buildPrnCancellationTransaction,
  performCreditAvailableBalanceForPrnCancellation,
  buildIssuedPrnCancellationTransaction,
  performCreditFullBalanceForIssuedPrnCancellation
} from './helpers.js'
import { calculateWasteBalanceUpdates } from '#domain/waste-balances/calculator.js'
import { audit } from '@defra/cdp-auditing'
import {
  WASTE_BALANCE_TRANSACTION_TYPE,
  WASTE_BALANCE_TRANSACTION_ENTITY_TYPE
} from '#domain/waste-balances/model.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import * as validationPipeline from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import * as tableSchemas from '#domain/summary-logs/table-schemas/index.js'

vi.mock('@defra/cdp-auditing', () => ({
  audit: vi.fn()
}))

vi.mock('#root/config.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'audit.maxPayloadSizeBytes') {
        return 10000
      }
      return undefined
    })
  }
}))

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    warn: vi.fn()
  }
}))

vi.mock('#domain/waste-balances/calculator.js', () => ({
  calculateWasteBalanceUpdates: vi.fn()
}))

describe('src/repositories/waste-balances/helpers.js', () => {
  describe('annotateRecordsWithExclusion', () => {
    it('should return empty array when wasteRecords is empty', () => {
      const result = annotateRecordsWithExclusion([])
      expect(result).toEqual([])
    })

    it('should mark all records as not excluded when processingType is not available', () => {
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

      const result = annotateRecordsWithExclusion([record1, record2])

      expect(result).toHaveLength(2)
      expect(result[0].excludedFromWasteBalance).toBe(false)
      expect(result[1].excludedFromWasteBalance).toBe(false)
    })

    it('should mark INCLUDED SENT_ON record as not excluded for exporters', () => {
      const sentOnRecord = {
        organisationId: 'org-1',
        type: WASTE_RECORD_TYPE.SENT_ON,
        data: {
          processingType: PROCESSING_TYPES.EXPORTER
        }
      }

      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      const createTableSchemaGetterSpy = vi.spyOn(
        tableSchemas,
        'createTableSchemaGetter'
      )

      createTableSchemaGetterSpy.mockReturnValue(() => ({}))
      classifyRowSpy.mockReturnValue({ outcome: ROW_OUTCOME.INCLUDED })

      const result = annotateRecordsWithExclusion([sentOnRecord])

      expect(result).toHaveLength(1)
      expect(result[0].excludedFromWasteBalance).toBe(false)

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })

    it('should mark record as not excluded when exporter has unknown record type (no matching schema)', () => {
      const unknownTypeRecord = {
        organisationId: 'org-1',
        type: 'unknown-type',
        data: {
          processingType: PROCESSING_TYPES.EXPORTER
        }
      }

      const result = annotateRecordsWithExclusion([unknownTypeRecord])

      expect(result).toHaveLength(1)
      expect(result[0].excludedFromWasteBalance).toBe(false)
    })

    it('should mark record as not excluded when processingType is not EXPORTER (no schema lookup)', () => {
      const reprocessorRecord = {
        organisationId: 'org-1',
        type: WASTE_RECORD_TYPE.EXPORTED,
        data: {
          processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
        }
      }

      const result = annotateRecordsWithExclusion([reprocessorRecord])

      expect(result).toHaveLength(1)
      expect(result[0].excludedFromWasteBalance).toBe(false)
    })

    it('should mark INCLUDED PROCESSED record as not excluded for reprocessor output', () => {
      const processedRecord = {
        organisationId: 'org-1',
        type: WASTE_RECORD_TYPE.PROCESSED,
        data: {
          processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT
        }
      }

      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      const createTableSchemaGetterSpy = vi.spyOn(
        tableSchemas,
        'createTableSchemaGetter'
      )

      createTableSchemaGetterSpy.mockReturnValue(() => ({}))
      classifyRowSpy.mockReturnValue({ outcome: ROW_OUTCOME.INCLUDED })

      const result = annotateRecordsWithExclusion([processedRecord])

      expect(result).toHaveLength(1)
      expect(result[0].excludedFromWasteBalance).toBe(false)

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })

    it('should mark INCLUDED SENT_ON record as not excluded for reprocessor output', () => {
      const sentOnRecord = {
        organisationId: 'org-1',
        type: WASTE_RECORD_TYPE.SENT_ON,
        data: {
          processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT
        }
      }

      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      const createTableSchemaGetterSpy = vi.spyOn(
        tableSchemas,
        'createTableSchemaGetter'
      )

      createTableSchemaGetterSpy.mockReturnValue(() => ({}))
      classifyRowSpy.mockReturnValue({ outcome: ROW_OUTCOME.INCLUDED })

      const result = annotateRecordsWithExclusion([sentOnRecord])

      expect(result).toHaveLength(1)
      expect(result[0].excludedFromWasteBalance).toBe(false)

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })

    it('should mark INCLUDED RECEIVED record as not excluded for reprocessor input', () => {
      const receivedRecord = {
        organisationId: 'org-1',
        type: WASTE_RECORD_TYPE.RECEIVED,
        data: {
          processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
        }
      }

      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      const createTableSchemaGetterSpy = vi.spyOn(
        tableSchemas,
        'createTableSchemaGetter'
      )

      createTableSchemaGetterSpy.mockReturnValue(() => ({}))
      classifyRowSpy.mockReturnValue({ outcome: ROW_OUTCOME.INCLUDED })

      const result = annotateRecordsWithExclusion([receivedRecord])

      expect(result).toHaveLength(1)
      expect(result[0].excludedFromWasteBalance).toBe(false)

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })

    it('should mark INCLUDED EXPORTED record as not excluded for exporters', () => {
      const exportedRecord = {
        organisationId: 'org-1',
        type: WASTE_RECORD_TYPE.EXPORTED,
        data: {
          processingType: PROCESSING_TYPES.EXPORTER
        }
      }

      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      const createTableSchemaGetterSpy = vi.spyOn(
        tableSchemas,
        'createTableSchemaGetter'
      )

      createTableSchemaGetterSpy.mockReturnValue(() => ({}))
      classifyRowSpy.mockReturnValue({ outcome: ROW_OUTCOME.INCLUDED })

      const result = annotateRecordsWithExclusion([exportedRecord])

      expect(result).toHaveLength(1)
      expect(result[0].excludedFromWasteBalance).toBe(false)

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })

    it('should mark record as not excluded when processingType is completely unknown', () => {
      const unknownProcRecord = {
        organisationId: 'org-1',
        type: WASTE_RECORD_TYPE.EXPORTED,
        data: {
          processingType: 'completely-unknown'
        }
      }

      const result = annotateRecordsWithExclusion([unknownProcRecord])

      expect(result).toHaveLength(1)
      expect(result[0].excludedFromWasteBalance).toBe(false)
    })

    it('should mark INCLUDED SENT_ON record as not excluded for reprocessor input', () => {
      const sentOnRecord = {
        organisationId: 'org-1',
        type: WASTE_RECORD_TYPE.SENT_ON,
        data: {
          processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
        }
      }

      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      const createTableSchemaGetterSpy = vi.spyOn(
        tableSchemas,
        'createTableSchemaGetter'
      )

      createTableSchemaGetterSpy.mockReturnValue(() => ({}))
      classifyRowSpy.mockReturnValue({ outcome: ROW_OUTCOME.INCLUDED })

      const result = annotateRecordsWithExclusion([sentOnRecord])

      expect(result).toHaveLength(1)
      expect(result[0].excludedFromWasteBalance).toBe(false)

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })

    it('should mark record as not excluded for unknown record type in reprocessor output', () => {
      const unknownRecord = {
        organisationId: 'org-1',
        type: 'UNKNOWN',
        data: {
          processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT
        }
      }

      const result = annotateRecordsWithExclusion([unknownRecord])

      expect(result).toHaveLength(1)
      expect(result[0].excludedFromWasteBalance).toBe(false)
    })

    it('should mark EXCLUDED record as excluded (PAE-1108)', () => {
      const excludedRecord = {
        organisationId: 'org-1',
        type: WASTE_RECORD_TYPE.EXPORTED,
        data: {
          processingType: PROCESSING_TYPES.EXPORTER
        }
      }

      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      const createTableSchemaGetterSpy = vi.spyOn(
        tableSchemas,
        'createTableSchemaGetter'
      )

      createTableSchemaGetterSpy.mockReturnValue(() => ({}))
      classifyRowSpy.mockReturnValue({ outcome: ROW_OUTCOME.EXCLUDED })

      const result = annotateRecordsWithExclusion([excludedRecord])

      expect(result).toHaveLength(1)
      expect(result[0].excludedFromWasteBalance).toBe(true)

      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
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

    it('should audit and log system log when user is provided', async () => {
      const wasteRecords = [
        {
          id: 'rec-1',
          organisationId: 'org-1',
          data: {} // no processingType
        }
      ]
      const user = { id: 'user-1' }
      const accreditation = { id: 'acc-1' }
      const wasteBalance = {
        id: 'bal-1',
        accreditationId: 'acc-1',
        amount: 100,
        availableAmount: 100,
        transactions: [],
        version: 1
      }
      const newTransactions = [{ id: 'trans-1' }]
      const newAmount = 200
      const newAvailableAmount = 200

      const findBalance = vi.fn().mockResolvedValue(wasteBalance)
      const saveBalance = vi.fn().mockResolvedValue()

      const dependencies = {
        organisationsRepository: {
          findAccreditationById: vi.fn().mockResolvedValue(accreditation)
        },
        systemLogsRepository: {
          insert: vi.fn().mockResolvedValue()
        }
      }

      vi.mocked(calculateWasteBalanceUpdates).mockReturnValue({
        newTransactions,
        newAmount,
        newAvailableAmount
      })

      await performUpdateWasteBalanceTransactions({
        wasteRecords,
        accreditationId: 'acc-1',
        dependencies,
        findBalance,
        saveBalance,
        user
      })

      expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({
          user,
          context: {
            accreditationId: 'acc-1',
            amount: 200,
            availableAmount: 200,
            newTransactions
          }
        })
      )

      expect(dependencies.systemLogsRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          createdBy: user
        })
      )
    })

    it('should save balance but skip audit when user is not provided', async () => {
      const wasteRecords = [
        {
          id: 'rec-1',
          organisationId: 'org-1',
          data: {}
        }
      ]
      const accreditation = { id: 'acc-1' }
      const wasteBalance = {
        id: 'bal-1',
        accreditationId: 'acc-1',
        amount: 100,
        availableAmount: 100,
        transactions: [],
        version: 0 // Explicit 0
      }
      const newTransactions = [{ id: 'trans-1' }]

      const findBalance = vi.fn().mockResolvedValue(wasteBalance)
      const saveBalance = vi.fn().mockResolvedValue()

      const dependencies = {
        organisationsRepository: {
          findAccreditationById: vi.fn().mockResolvedValue(accreditation)
        }
      }

      vi.mocked(calculateWasteBalanceUpdates).mockReturnValue({
        newTransactions,
        newAmount: 200,
        newAvailableAmount: 200
      })

      await performUpdateWasteBalanceTransactions({
        wasteRecords,
        accreditationId: 'acc-1',
        dependencies,
        findBalance,
        saveBalance
        // user undefined
      })

      expect(audit).not.toHaveBeenCalled()
      expect(saveBalance).toHaveBeenCalled()
    })

    it('should audit but skip system log when systemLogsRepository is missing', async () => {
      const wasteRecords = [
        {
          id: 'rec-1',
          organisationId: 'org-1',
          data: {}
        }
      ]
      const user = { id: 'user-1' }
      const accreditation = { id: 'acc-1' }
      const wasteBalance = {
        id: 'bal-1',
        accreditationId: 'acc-1',
        amount: 100,
        availableAmount: 100
        // transactions undefined
        // version undefined
      }
      const newTransactions = [{ id: 'trans-1' }]
      const newAmount = 200
      const newAvailableAmount = 200

      const findBalance = vi.fn().mockResolvedValue(wasteBalance)
      const saveBalance = vi.fn().mockResolvedValue()

      // Dependencies without systemLogsRepository
      const dependencies = {
        organisationsRepository: {
          findAccreditationById: vi.fn().mockResolvedValue(accreditation)
        }
      }

      vi.mocked(calculateWasteBalanceUpdates).mockReturnValue({
        newTransactions,
        newAmount,
        newAvailableAmount
      })

      await performUpdateWasteBalanceTransactions({
        wasteRecords,
        accreditationId: 'acc-1',
        dependencies,
        findBalance,
        saveBalance,
        user
      })

      // Should still audit
      expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({
          user,
          context: {
            accreditationId: 'acc-1',
            amount: 200,
            availableAmount: 200,
            newTransactions
          }
        })
      )

      // No system log insert attempt should be made (and no crash)
    })

    it('should send reduced context to CDP audit when payload exceeds size limit', async () => {
      // Create enough large transactions to exceed the 10000 byte mock limit
      const largeTransactions = Array.from({ length: 50 }, (_, i) => ({
        id: `trans-${i}`,
        type: 'credit',
        amount: 100,
        entities: [{ id: `entity-${i}`, data: 'x'.repeat(200) }]
      }))

      const wasteRecords = [{ id: 'rec-1', organisationId: 'org-1', data: {} }]
      const user = { id: 'user-1' }
      const accreditation = { id: 'acc-1' }
      const wasteBalance = {
        id: 'bal-1',
        accreditationId: 'acc-1',
        amount: 100,
        availableAmount: 100,
        transactions: [],
        version: 1
      }

      const findBalance = vi.fn().mockResolvedValue(wasteBalance)
      const saveBalance = vi.fn().mockResolvedValue()

      const dependencies = {
        organisationsRepository: {
          findAccreditationById: vi.fn().mockResolvedValue(accreditation)
        },
        systemLogsRepository: {
          insert: vi.fn().mockResolvedValue()
        }
      }

      vi.mocked(calculateWasteBalanceUpdates).mockReturnValue({
        newTransactions: largeTransactions,
        newAmount: 200,
        newAvailableAmount: 200
      })

      await performUpdateWasteBalanceTransactions({
        wasteRecords,
        accreditationId: 'acc-1',
        dependencies,
        findBalance,
        saveBalance,
        user
      })

      // CDP audit should get reduced context
      expect(audit).toHaveBeenCalledWith({
        event: {
          category: 'waste-reporting',
          subCategory: 'waste-balance',
          action: 'update'
        },
        context: {
          accreditationId: 'acc-1',
          amount: 200,
          availableAmount: 200,
          transactionCount: 50
        },
        user
      })

      // System log should still get full context
      expect(dependencies.systemLogsRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          context: {
            accreditationId: 'acc-1',
            amount: 200,
            availableAmount: 200,
            newTransactions: largeTransactions
          }
        })
      )
    })

    it('should throw error when organisationsRepository dependency is missing', async () => {
      const wasteRecords = [{ id: 'rec-1', data: {} }]

      await expect(
        performUpdateWasteBalanceTransactions({
          wasteRecords,
          accreditationId: 'acc-1',
          dependencies: {}, // missing organisationsRepository
          findBalance: vi.fn(),
          saveBalance: vi.fn()
        })
      ).rejects.toThrow('organisationsRepository dependency is required')
    })

    it('should throw error when accreditation is not found', async () => {
      const wasteRecords = [{ id: 'rec-1', organisationId: 'org-1', data: {} }]

      const dependencies = {
        organisationsRepository: {
          findAccreditationById: vi.fn().mockResolvedValue(null) // Not found
        }
      }

      await expect(
        performUpdateWasteBalanceTransactions({
          wasteRecords,
          accreditationId: 'acc-1',
          dependencies,
          findBalance: vi.fn(),
          saveBalance: vi.fn()
        })
      ).rejects.toThrow('Accreditation not found: acc-1')
    })

    it('should return early if waste balance cannot be found or created', async () => {
      const wasteRecords = [
        {
          id: 'rec-1',
          organisationId: null,
          data: {}
        }
      ]

      const findBalance = vi.fn().mockResolvedValue(null)
      const saveBalance = vi.fn()

      const dependencies = {
        organisationsRepository: {
          findAccreditationById: vi.fn().mockResolvedValue({ id: 'acc-1' })
        }
      }

      await performUpdateWasteBalanceTransactions({
        wasteRecords,
        accreditationId: 'acc-1',
        dependencies,
        findBalance,
        saveBalance
      })

      expect(saveBalance).not.toHaveBeenCalled()
    })

    it('should return early when no new transactions are calculated', async () => {
      const wasteRecords = [{ id: 'rec-1', organisationId: 'org-1', data: {} }]
      const accreditation = { id: 'acc-1' }
      const wasteBalance = { id: 'bal-1' }

      const dependencies = {
        organisationsRepository: {
          findAccreditationById: vi.fn().mockResolvedValue(accreditation)
        }
      }

      const findBalance = vi.fn().mockResolvedValue(wasteBalance)
      const saveBalance = vi.fn()

      // calculateWasteBalanceUpdates returns empty transactions
      vi.mocked(calculateWasteBalanceUpdates).mockReturnValue({
        newTransactions: [],
        newAmount: 100,
        newAvailableAmount: 100
      })

      await performUpdateWasteBalanceTransactions({
        wasteRecords,
        accreditationId: 'acc-1',
        dependencies,
        findBalance,
        saveBalance
      })

      // Should not save balance
      expect(saveBalance).not.toHaveBeenCalled()
    })
  })

  describe('buildPrnCreationTransaction', () => {
    it('should build a transaction that deducts from availableAmount only', () => {
      const currentBalance = {
        id: 'balance-1',
        organisationId: 'org-1',
        accreditationId: 'acc-1',
        amount: 500,
        availableAmount: 400,
        transactions: [],
        version: 1,
        schemaVersion: 1
      }

      const transaction = buildPrnCreationTransaction({
        prnId: 'prn-123',
        tonnage: 50.5,
        userId: 'user-abc',
        currentBalance
      })

      expect(transaction.type).toBe(WASTE_BALANCE_TRANSACTION_TYPE.DEBIT)
      expect(transaction.amount).toBe(50.5)
      expect(transaction.openingAmount).toBe(500)
      expect(transaction.closingAmount).toBe(500)
      expect(transaction.openingAvailableAmount).toBe(400)
      expect(transaction.closingAvailableAmount).toBe(349.5)
      expect(transaction.entities).toHaveLength(1)
      expect(transaction.entities[0].id).toBe('prn-123')
      expect(transaction.entities[0].type).toBe(
        WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.PRN_CREATED
      )
      expect(transaction.createdBy).toEqual({
        id: 'user-abc',
        name: 'user-abc'
      })
      expect(transaction.id).toBeDefined()
      expect(transaction.createdAt).toBeDefined()
    })
  })

  describe('performDeductAvailableBalanceForPrnCreation', () => {
    it('should deduct tonnage from available balance and save', async () => {
      const existingBalance = {
        id: 'balance-1',
        organisationId: 'org-1',
        accreditationId: 'acc-1',
        amount: 500,
        availableAmount: 400,
        transactions: [],
        version: 1,
        schemaVersion: 1
      }

      const findBalance = vi.fn().mockResolvedValue(existingBalance)
      const saveBalance = vi.fn().mockResolvedValue(undefined)

      await performDeductAvailableBalanceForPrnCreation({
        deductParams: {
          accreditationId: 'acc-1',
          organisationId: 'org-1',
          prnId: 'prn-123',
          tonnage: 50.5,
          userId: 'user-abc'
        },
        findBalance,
        saveBalance
      })

      expect(findBalance).toHaveBeenCalledWith('acc-1')
      expect(saveBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 500,
          availableAmount: 349.5,
          version: 2
        }),
        expect.arrayContaining([
          expect.objectContaining({
            type: WASTE_BALANCE_TRANSACTION_TYPE.DEBIT,
            amount: 50.5
          })
        ])
      )
    })

    it('should return early if no balance exists', async () => {
      const findBalance = vi.fn().mockResolvedValue(null)
      const saveBalance = vi.fn()

      await performDeductAvailableBalanceForPrnCreation({
        deductParams: {
          accreditationId: 'acc-1',
          organisationId: 'org-1',
          prnId: 'prn-123',
          tonnage: 50.5,
          userId: 'user-abc'
        },
        findBalance,
        saveBalance
      })

      expect(findBalance).toHaveBeenCalledWith('acc-1')
      expect(saveBalance).not.toHaveBeenCalled()
    })

    it('should append to existing transactions', async () => {
      const existingTransaction = {
        id: 'existing-tx',
        type: WASTE_BALANCE_TRANSACTION_TYPE.CREDIT,
        amount: 100
      }
      const existingBalance = {
        id: 'balance-1',
        organisationId: 'org-1',
        accreditationId: 'acc-1',
        amount: 500,
        availableAmount: 400,
        transactions: [existingTransaction],
        version: 3,
        schemaVersion: 1
      }

      const findBalance = vi.fn().mockResolvedValue(existingBalance)
      const saveBalance = vi.fn().mockResolvedValue(undefined)

      await performDeductAvailableBalanceForPrnCreation({
        deductParams: {
          accreditationId: 'acc-1',
          organisationId: 'org-1',
          prnId: 'prn-456',
          tonnage: 25,
          userId: 'user-xyz'
        },
        findBalance,
        saveBalance
      })

      expect(saveBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          transactions: expect.arrayContaining([existingTransaction]),
          version: 4
        }),
        expect.any(Array)
      )
      expect(saveBalance.mock.calls[0][0].transactions).toHaveLength(2)
    })

    it('should handle balance with undefined transactions array', async () => {
      const existingBalance = {
        id: 'balance-1',
        organisationId: 'org-1',
        accreditationId: 'acc-1',
        amount: 100,
        availableAmount: 100,
        transactions: undefined,
        version: undefined,
        schemaVersion: 1
      }

      const findBalance = vi.fn().mockResolvedValue(existingBalance)
      const saveBalance = vi.fn().mockResolvedValue(undefined)

      await performDeductAvailableBalanceForPrnCreation({
        deductParams: {
          accreditationId: 'acc-1',
          organisationId: 'org-1',
          prnId: 'prn-789',
          tonnage: 10,
          userId: 'user-123'
        },
        findBalance,
        saveBalance
      })

      expect(saveBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          transactions: expect.arrayContaining([
            expect.objectContaining({ amount: 10 })
          ]),
          version: 1
        }),
        expect.any(Array)
      )
    })
  })

  describe('buildPrnIssuedTransaction', () => {
    it('should build a transaction that deducts from amount (total) only', () => {
      const currentBalance = {
        id: 'balance-1',
        organisationId: 'org-1',
        accreditationId: 'acc-1',
        amount: 500,
        availableAmount: 450, // Already reduced by 50 when PRN was created
        transactions: [],
        version: 1,
        schemaVersion: 1
      }

      const transaction = buildPrnIssuedTransaction({
        prnId: 'prn-123',
        tonnage: 50,
        userId: 'user-abc',
        currentBalance
      })

      expect(transaction.type).toBe(WASTE_BALANCE_TRANSACTION_TYPE.DEBIT)
      expect(transaction.amount).toBe(50)
      expect(transaction.openingAmount).toBe(500)
      expect(transaction.closingAmount).toBe(450) // Total deducted
      expect(transaction.openingAvailableAmount).toBe(450)
      expect(transaction.closingAvailableAmount).toBe(450) // Available unchanged
      expect(transaction.entities).toHaveLength(1)
      expect(transaction.entities[0].id).toBe('prn-123')
      expect(transaction.entities[0].type).toBe(
        WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.PRN_ISSUED
      )
      expect(transaction.createdBy).toEqual({
        id: 'user-abc',
        name: 'user-abc'
      })
      expect(transaction.id).toBeDefined()
      expect(transaction.createdAt).toBeDefined()
    })
  })

  describe('performDeductTotalBalanceForPrnIssue', () => {
    it('should deduct tonnage from total balance and save', async () => {
      const existingBalance = {
        id: 'balance-1',
        organisationId: 'org-1',
        accreditationId: 'acc-1',
        amount: 500,
        availableAmount: 450,
        transactions: [],
        version: 1,
        schemaVersion: 1
      }

      const findBalance = vi.fn().mockResolvedValue(existingBalance)
      const saveBalance = vi.fn().mockResolvedValue(undefined)

      await performDeductTotalBalanceForPrnIssue({
        deductParams: {
          accreditationId: 'acc-1',
          organisationId: 'org-1',
          prnId: 'prn-123',
          tonnage: 50,
          userId: 'user-abc'
        },
        findBalance,
        saveBalance
      })

      expect(findBalance).toHaveBeenCalledWith('acc-1')
      expect(saveBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 450, // Total deducted
          availableAmount: 450, // Available unchanged
          version: 2
        }),
        expect.arrayContaining([
          expect.objectContaining({
            type: WASTE_BALANCE_TRANSACTION_TYPE.DEBIT,
            amount: 50
          })
        ])
      )
    })

    it('should return early if no balance exists', async () => {
      const findBalance = vi.fn().mockResolvedValue(null)
      const saveBalance = vi.fn()

      await performDeductTotalBalanceForPrnIssue({
        deductParams: {
          accreditationId: 'acc-1',
          organisationId: 'org-1',
          prnId: 'prn-123',
          tonnage: 50,
          userId: 'user-abc'
        },
        findBalance,
        saveBalance
      })

      expect(findBalance).toHaveBeenCalledWith('acc-1')
      expect(saveBalance).not.toHaveBeenCalled()
    })

    it('should append to existing transactions', async () => {
      const existingTransaction = {
        id: 'existing-tx',
        type: WASTE_BALANCE_TRANSACTION_TYPE.CREDIT,
        amount: 100
      }
      const existingBalance = {
        id: 'balance-1',
        organisationId: 'org-1',
        accreditationId: 'acc-1',
        amount: 500,
        availableAmount: 475,
        transactions: [existingTransaction],
        version: 3,
        schemaVersion: 1
      }

      const findBalance = vi.fn().mockResolvedValue(existingBalance)
      const saveBalance = vi.fn().mockResolvedValue(undefined)

      await performDeductTotalBalanceForPrnIssue({
        deductParams: {
          accreditationId: 'acc-1',
          organisationId: 'org-1',
          prnId: 'prn-456',
          tonnage: 25,
          userId: 'user-xyz'
        },
        findBalance,
        saveBalance
      })

      expect(saveBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          transactions: expect.arrayContaining([existingTransaction]),
          version: 4
        }),
        expect.any(Array)
      )
      expect(saveBalance.mock.calls[0][0].transactions).toHaveLength(2)
    })

    it('should handle balance with undefined transactions array', async () => {
      const existingBalance = {
        id: 'balance-1',
        organisationId: 'org-1',
        accreditationId: 'acc-1',
        amount: 100,
        availableAmount: 90,
        transactions: undefined,
        version: undefined,
        schemaVersion: 1
      }

      const findBalance = vi.fn().mockResolvedValue(existingBalance)
      const saveBalance = vi.fn().mockResolvedValue(undefined)

      await performDeductTotalBalanceForPrnIssue({
        deductParams: {
          accreditationId: 'acc-1',
          organisationId: 'org-1',
          prnId: 'prn-789',
          tonnage: 10,
          userId: 'user-123'
        },
        findBalance,
        saveBalance
      })

      expect(saveBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 90,
          transactions: expect.arrayContaining([
            expect.objectContaining({ amount: 10 })
          ]),
          version: 1
        }),
        expect.any(Array)
      )
    })
  })

  describe('buildPrnCancellationTransaction', () => {
    it('should build a credit transaction that restores availableAmount only', () => {
      const currentBalance = {
        id: 'balance-1',
        organisationId: 'org-1',
        accreditationId: 'acc-1',
        amount: 500,
        availableAmount: 350,
        transactions: [],
        version: 1,
        schemaVersion: 1
      }

      const transaction = buildPrnCancellationTransaction({
        prnId: 'prn-123',
        tonnage: 50,
        userId: 'user-abc',
        currentBalance
      })

      expect(transaction.type).toBe(WASTE_BALANCE_TRANSACTION_TYPE.CREDIT)
      expect(transaction.amount).toBe(50)
      expect(transaction.openingAmount).toBe(500)
      expect(transaction.closingAmount).toBe(500)
      expect(transaction.openingAvailableAmount).toBe(350)
      expect(transaction.closingAvailableAmount).toBe(400)
      expect(transaction.entities).toHaveLength(1)
      expect(transaction.entities[0].id).toBe('prn-123')
      expect(transaction.entities[0].type).toBe(
        WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.PRN_CANCELLED
      )
      expect(transaction.createdBy).toEqual({
        id: 'user-abc',
        name: 'user-abc'
      })
      expect(transaction.id).toBeDefined()
      expect(transaction.createdAt).toBeDefined()
    })
  })

  describe('performCreditAvailableBalanceForPrnCancellation', () => {
    it('should credit tonnage back to available balance and save', async () => {
      const existingBalance = {
        id: 'balance-1',
        organisationId: 'org-1',
        accreditationId: 'acc-1',
        amount: 500,
        availableAmount: 350,
        transactions: [],
        version: 1,
        schemaVersion: 1
      }

      const findBalance = vi.fn().mockResolvedValue(existingBalance)
      const saveBalance = vi.fn().mockResolvedValue(undefined)

      await performCreditAvailableBalanceForPrnCancellation({
        creditParams: {
          accreditationId: 'acc-1',
          organisationId: 'org-1',
          prnId: 'prn-123',
          tonnage: 50,
          userId: 'user-abc'
        },
        findBalance,
        saveBalance
      })

      expect(findBalance).toHaveBeenCalledWith('acc-1')
      expect(saveBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 500,
          availableAmount: 400,
          version: 2
        }),
        expect.arrayContaining([
          expect.objectContaining({
            type: WASTE_BALANCE_TRANSACTION_TYPE.CREDIT,
            amount: 50
          })
        ])
      )
    })

    it('should throw if no balance exists', async () => {
      const findBalance = vi.fn().mockResolvedValue(null)
      const saveBalance = vi.fn()

      await expect(
        performCreditAvailableBalanceForPrnCancellation({
          creditParams: {
            accreditationId: 'acc-1',
            organisationId: 'org-1',
            prnId: 'prn-123',
            tonnage: 50,
            userId: 'user-abc'
          },
          findBalance,
          saveBalance
        })
      ).rejects.toThrow(Boom.Boom)

      expect(findBalance).toHaveBeenCalledWith('acc-1')
      expect(saveBalance).not.toHaveBeenCalled()
    })

    it('should append to existing transactions', async () => {
      const existingTransaction = {
        id: 'existing-tx',
        type: WASTE_BALANCE_TRANSACTION_TYPE.DEBIT,
        amount: 50
      }
      const existingBalance = {
        id: 'balance-1',
        organisationId: 'org-1',
        accreditationId: 'acc-1',
        amount: 500,
        availableAmount: 350,
        transactions: [existingTransaction],
        version: 3,
        schemaVersion: 1
      }

      const findBalance = vi.fn().mockResolvedValue(existingBalance)
      const saveBalance = vi.fn().mockResolvedValue(undefined)

      await performCreditAvailableBalanceForPrnCancellation({
        creditParams: {
          accreditationId: 'acc-1',
          organisationId: 'org-1',
          prnId: 'prn-456',
          tonnage: 25,
          userId: 'user-xyz'
        },
        findBalance,
        saveBalance
      })

      expect(saveBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          transactions: expect.arrayContaining([existingTransaction]),
          version: 4
        }),
        expect.any(Array)
      )
      expect(saveBalance.mock.calls[0][0].transactions).toHaveLength(2)
    })

    it('should handle balance with undefined transactions array', async () => {
      const existingBalance = {
        id: 'balance-1',
        organisationId: 'org-1',
        accreditationId: 'acc-1',
        amount: 100,
        availableAmount: 60,
        transactions: undefined,
        version: undefined,
        schemaVersion: 1
      }

      const findBalance = vi.fn().mockResolvedValue(existingBalance)
      const saveBalance = vi.fn().mockResolvedValue(undefined)

      await performCreditAvailableBalanceForPrnCancellation({
        creditParams: {
          accreditationId: 'acc-1',
          organisationId: 'org-1',
          prnId: 'prn-789',
          tonnage: 10,
          userId: 'user-123'
        },
        findBalance,
        saveBalance
      })

      expect(saveBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 100,
          availableAmount: 70,
          transactions: expect.arrayContaining([
            expect.objectContaining({ amount: 10 })
          ]),
          version: 1
        }),
        expect.any(Array)
      )
    })
  })

  describe('buildIssuedPrnCancellationTransaction', () => {
    it('should build a credit transaction that restores both amount and availableAmount', () => {
      const currentBalance = {
        id: 'balance-1',
        organisationId: 'org-1',
        accreditationId: 'acc-1',
        amount: 400,
        availableAmount: 350,
        transactions: [],
        version: 1,
        schemaVersion: 1
      }

      const transaction = buildIssuedPrnCancellationTransaction({
        prnId: 'prn-123',
        tonnage: 60,
        userId: 'user-abc',
        currentBalance
      })

      expect(transaction.type).toBe(WASTE_BALANCE_TRANSACTION_TYPE.CREDIT)
      expect(transaction.amount).toBe(60)
      expect(transaction.openingAmount).toBe(400)
      expect(transaction.closingAmount).toBe(460)
      expect(transaction.openingAvailableAmount).toBe(350)
      expect(transaction.closingAvailableAmount).toBe(410)
      expect(transaction.entities).toHaveLength(1)
      expect(transaction.entities[0].id).toBe('prn-123')
      expect(transaction.entities[0].type).toBe(
        WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.PRN_CANCELLED_POST_ISSUE
      )
      expect(transaction.createdBy).toEqual({
        id: 'user-abc',
        name: 'user-abc'
      })
      expect(transaction.id).toBeDefined()
      expect(transaction.createdAt).toBeDefined()
    })
  })

  describe('performCreditFullBalanceForIssuedPrnCancellation', () => {
    it('should credit tonnage back to both amount and available balance and save', async () => {
      const existingBalance = {
        id: 'balance-1',
        organisationId: 'org-1',
        accreditationId: 'acc-1',
        amount: 400,
        availableAmount: 350,
        transactions: [],
        version: 1,
        schemaVersion: 1
      }

      const findBalance = vi.fn().mockResolvedValue(existingBalance)
      const saveBalance = vi.fn().mockResolvedValue(undefined)

      await performCreditFullBalanceForIssuedPrnCancellation({
        creditParams: {
          accreditationId: 'acc-1',
          organisationId: 'org-1',
          prnId: 'prn-123',
          tonnage: 60,
          userId: 'user-abc'
        },
        findBalance,
        saveBalance
      })

      expect(findBalance).toHaveBeenCalledWith('acc-1')
      expect(saveBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 460,
          availableAmount: 410,
          version: 2
        }),
        expect.arrayContaining([
          expect.objectContaining({
            type: WASTE_BALANCE_TRANSACTION_TYPE.CREDIT,
            amount: 60
          })
        ])
      )
    })

    it('should throw if no balance exists', async () => {
      const findBalance = vi.fn().mockResolvedValue(null)
      const saveBalance = vi.fn()

      await expect(
        performCreditFullBalanceForIssuedPrnCancellation({
          creditParams: {
            accreditationId: 'acc-1',
            organisationId: 'org-1',
            prnId: 'prn-123',
            tonnage: 60,
            userId: 'user-abc'
          },
          findBalance,
          saveBalance
        })
      ).rejects.toThrow(Boom.Boom)

      expect(findBalance).toHaveBeenCalledWith('acc-1')
      expect(saveBalance).not.toHaveBeenCalled()
    })

    it('should handle balance with undefined transactions and version', async () => {
      const existingBalance = {
        id: 'balance-1',
        organisationId: 'org-1',
        accreditationId: 'acc-1',
        amount: 400,
        availableAmount: 350,
        transactions: undefined,
        version: undefined,
        schemaVersion: 1
      }

      const findBalance = vi.fn().mockResolvedValue(existingBalance)
      const saveBalance = vi.fn().mockResolvedValue(undefined)

      await performCreditFullBalanceForIssuedPrnCancellation({
        creditParams: {
          accreditationId: 'acc-1',
          organisationId: 'org-1',
          prnId: 'prn-123',
          tonnage: 60,
          userId: 'user-abc'
        },
        findBalance,
        saveBalance
      })

      expect(saveBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 460,
          availableAmount: 410,
          transactions: expect.arrayContaining([
            expect.objectContaining({ amount: 60 })
          ]),
          version: 1
        }),
        expect.any(Array)
      )
    })
  })
})
