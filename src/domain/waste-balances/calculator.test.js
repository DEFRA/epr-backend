import { describe, it, expect } from 'vitest'
import {
  calculateWasteBalanceUpdates,
  getTransactionAmount,
  isWithinRange
} from './calculator.js'
import { EXPORTER_FIELD, REPROCESSOR_INPUT_FIELD } from './constants.js'
import {
  WASTE_RECORD_TYPE,
  VERSION_STATUS
} from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import {
  WASTE_BALANCE_TRANSACTION_TYPE,
  WASTE_BALANCE_TRANSACTION_ENTITY_TYPE
} from '#domain/waste-balances/model.js'

const buildWasteRecord = (overrides = {}) => {
  const defaultData = {
    processingType: PROCESSING_TYPES.EXPORTER,
    [EXPORTER_FIELD.PRN_ISSUED]: 'No',
    [EXPORTER_FIELD.INTERIM_SITE]: 'No',
    [EXPORTER_FIELD.EXPORT_TONNAGE]: 10,
    [EXPORTER_FIELD.INTERIM_TONNAGE]: 0,
    'Date Received': '2025-01-20'
  }

  const testUser = {
    id: 'user-1',
    name: 'Test User'
  }

  return {
    organisationId: 'org-1',
    registrationId: 'reg-1',
    accreditationId: 'acc-1',
    rowId: 'row-1',
    type: WASTE_RECORD_TYPE.EXPORTED,
    updatedBy: testUser,
    versions: [
      {
        id: 'v1',
        createdAt: '2025-01-20T10:00:00.000Z',
        status: VERSION_STATUS.CREATED,
        summaryLog: { id: 'log-1', uri: 's3://...' },
        data: {}
      }
    ],
    ...overrides,
    data: {
      ...defaultData,
      ...(overrides.data || {})
    }
  }
}

describe('Waste Balance Calculator', () => {
  const accreditation = {
    validFrom: '2023-01-01',
    validTo: '2023-12-31'
  }

  const testUser = {
    id: 'user-1',
    name: 'Test User'
  }

  const emptyBalance = {
    id: 'bal-1',
    organisationId: 'org-1',
    accreditationId: 'acc-1',
    schemaVersion: 1,
    version: 1,
    amount: 0,
    availableAmount: 0,
    transactions: []
  }

  it('AC01a: Should create transactions for valid PRN records (Export Tonnage)', () => {
    const record = buildWasteRecord({
      data: {
        [EXPORTER_FIELD.PRN_ISSUED]: 'No',
        [EXPORTER_FIELD.DATE_OF_EXPORT]: '2023-06-01',
        [EXPORTER_FIELD.INTERIM_SITE]: 'No',
        [EXPORTER_FIELD.EXPORT_TONNAGE]: '10.5'
      }
    })

    const result = calculateWasteBalanceUpdates({
      currentBalance: emptyBalance,
      wasteRecords: [record],
      accreditation
    })

    expect(result.newTransactions).toHaveLength(1)
    expect(result.newTransactions[0].amount).toBe(10.5)
    expect(result.newAmount).toBe(10.5)
    expect(result.newAvailableAmount).toBe(10.5)
  })

  it('AC01b: Should create transactions for valid PRN records (Interim Tonnage)', () => {
    const record = buildWasteRecord({
      data: {
        [EXPORTER_FIELD.PRN_ISSUED]: 'No',
        [EXPORTER_FIELD.DATE_OF_EXPORT]: '2023-06-01',
        [EXPORTER_FIELD.INTERIM_SITE]: 'Yes',
        [EXPORTER_FIELD.INTERIM_TONNAGE]: '20.0'
      }
    })

    const result = calculateWasteBalanceUpdates({
      currentBalance: emptyBalance,
      wasteRecords: [record],
      accreditation
    })

    expect(result.newTransactions).toHaveLength(1)
    expect(result.newTransactions[0].amount).toBe(20.0)
    expect(result.newAmount).toBe(20.0)
    expect(result.newAvailableAmount).toBe(20.0)
  })

  it('AC02: Should ignore records where PRN was already issued', () => {
    const record = buildWasteRecord({
      data: {
        [EXPORTER_FIELD.PRN_ISSUED]: 'Yes',
        [EXPORTER_FIELD.DATE_OF_EXPORT]: '2023-06-01',
        [EXPORTER_FIELD.EXPORT_TONNAGE]: '10.0'
      }
    })

    const result = calculateWasteBalanceUpdates({
      currentBalance: emptyBalance,
      wasteRecords: [record],
      accreditation
    })

    expect(result.newTransactions).toHaveLength(0)
    expect(result.newAmount).toBe(0)
  })

  it('AC03: Should ignore records outside accreditation date range', () => {
    const record = buildWasteRecord({
      data: {
        [EXPORTER_FIELD.PRN_ISSUED]: 'No',
        [EXPORTER_FIELD.DATE_OF_EXPORT]: '2022-12-31', // Before validFrom
        [EXPORTER_FIELD.EXPORT_TONNAGE]: '10.0'
      }
    })

    const result = calculateWasteBalanceUpdates({
      currentBalance: emptyBalance,
      wasteRecords: [record],
      accreditation
    })

    expect(result.newTransactions).toHaveLength(0)
    expect(result.newAmount).toBe(0)
  })

  it('AC04: Should aggregate multiple valid records', () => {
    const record1 = buildWasteRecord({
      rowId: 'row-1',
      data: {
        [EXPORTER_FIELD.PRN_ISSUED]: 'No',
        [EXPORTER_FIELD.DATE_OF_EXPORT]: '2023-06-01',
        [EXPORTER_FIELD.EXPORT_TONNAGE]: '10.0'
      }
    })
    const record2 = buildWasteRecord({
      rowId: 'row-2',
      data: {
        [EXPORTER_FIELD.PRN_ISSUED]: 'No',
        [EXPORTER_FIELD.DATE_OF_EXPORT]: '2023-07-01',
        [EXPORTER_FIELD.EXPORT_TONNAGE]: '20.0'
      }
    })

    const result = calculateWasteBalanceUpdates({
      currentBalance: emptyBalance,
      wasteRecords: [record1, record2],
      accreditation
    })

    expect(result.newTransactions).toHaveLength(2)
    expect(result.newAmount).toBe(30.0)
    expect(result.newAvailableAmount).toBe(30.0)

    // Verify transaction details
    expect(result.newTransactions[0].amount).toBe(10.0)
    expect(result.newTransactions[0].openingAmount).toBe(0)
    expect(result.newTransactions[0].closingAmount).toBe(10.0)

    expect(result.newTransactions[1].amount).toBe(20.0)
    expect(result.newTransactions[1].openingAmount).toBe(10.0)
    expect(result.newTransactions[1].closingAmount).toBe(30.0)
  })

  it('Should ignore records with zero or negative amount', () => {
    const record = buildWasteRecord({
      data: {
        [EXPORTER_FIELD.PRN_ISSUED]: 'No',
        [EXPORTER_FIELD.DATE_OF_EXPORT]: '2023-06-01',
        [EXPORTER_FIELD.EXPORT_TONNAGE]: '0'
      }
    })

    const result = calculateWasteBalanceUpdates({
      currentBalance: emptyBalance,
      wasteRecords: [record],
      accreditation
    })

    expect(result.newTransactions).toHaveLength(0)
    expect(result.newAmount).toBe(0)
    expect(result.newAvailableAmount).toBe(0)
  })

  it('Should ignore records with missing dispatch date', () => {
    const record = buildWasteRecord({
      data: {
        [EXPORTER_FIELD.PRN_ISSUED]: 'No',
        [EXPORTER_FIELD.EXPORT_TONNAGE]: '10.0'
        // DATE_OF_EXPORT missing
      }
    })

    const result = calculateWasteBalanceUpdates({
      currentBalance: emptyBalance,
      wasteRecords: [record],
      accreditation
    })

    expect(result.newTransactions).toHaveLength(0)
  })

  it('Should default to export tonnage if interim site is missing', () => {
    const record = buildWasteRecord({
      data: {
        [EXPORTER_FIELD.PRN_ISSUED]: 'No',
        [EXPORTER_FIELD.DATE_OF_EXPORT]: '2023-06-01',
        [EXPORTER_FIELD.EXPORT_TONNAGE]: '15.0'
        // INTERIM_SITE missing
      }
    })

    const result = calculateWasteBalanceUpdates({
      currentBalance: emptyBalance,
      wasteRecords: [record],
      accreditation
    })

    expect(result.newTransactions).toHaveLength(1)
    expect(result.newTransactions[0].amount).toBe(15.0)
  })

  it('Should default to 0 if interim tonnage is missing when interim site is Yes', () => {
    const record = buildWasteRecord({
      data: {
        [EXPORTER_FIELD.PRN_ISSUED]: 'No',
        [EXPORTER_FIELD.DATE_OF_EXPORT]: '2023-06-01',
        [EXPORTER_FIELD.INTERIM_SITE]: 'Yes'
        // INTERIM_TONNAGE missing
      }
    })

    const result = calculateWasteBalanceUpdates({
      currentBalance: emptyBalance,
      wasteRecords: [record],
      accreditation
    })

    expect(result.newTransactions).toHaveLength(0)
  })

  it('Should default to 0 if export tonnage is missing', () => {
    const record = buildWasteRecord({
      data: {
        [EXPORTER_FIELD.PRN_ISSUED]: 'No',
        [EXPORTER_FIELD.DATE_OF_EXPORT]: '2023-06-01',
        [EXPORTER_FIELD.INTERIM_SITE]: 'No',
        [EXPORTER_FIELD.EXPORT_TONNAGE]: undefined
      }
    })

    const result = calculateWasteBalanceUpdates({
      currentBalance: emptyBalance,
      wasteRecords: [record],
      accreditation
    })

    expect(result.newTransactions).toHaveLength(0)
  })

  it('Should account for existing CREDIT transactions', () => {
    const record = buildWasteRecord({
      rowId: 'row-1',
      data: {
        [EXPORTER_FIELD.PRN_ISSUED]: 'No',
        [EXPORTER_FIELD.DATE_OF_EXPORT]: '2023-06-01',
        [EXPORTER_FIELD.EXPORT_TONNAGE]: '20.0'
      }
    })

    const existingTransaction = {
      id: 'tx-1',
      type: WASTE_BALANCE_TRANSACTION_TYPE.CREDIT,
      amount: 10.0,
      entities: [
        {
          id: 'row-1',
          type: WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.WASTE_RECORD_RECEIVED,
          currentVersionId: 'v1',
          previousVersionIds: []
        }
      ],
      createdAt: '2023-01-01T00:00:00.000Z',
      createdBy: { id: 'user-1', name: 'Test User' },
      openingAmount: 0,
      closingAmount: 10.0,
      openingAvailableAmount: 0,
      closingAvailableAmount: 10.0
    }

    const currentBalance = {
      ...emptyBalance,
      transactions: [existingTransaction]
    }

    const result = calculateWasteBalanceUpdates({
      currentBalance,
      wasteRecords: [record],
      accreditation
    })

    // Target is 20, already credited 10. Delta is 10.
    expect(result.newTransactions).toHaveLength(1)
    expect(result.newTransactions[0].amount).toBe(10.0)
    expect(result.newTransactions[0].type).toBe(
      WASTE_BALANCE_TRANSACTION_TYPE.CREDIT
    )
  })

  it('Should account for existing DEBIT transactions', () => {
    const record = buildWasteRecord({
      rowId: 'row-1',
      data: {
        [EXPORTER_FIELD.PRN_ISSUED]: 'No',
        [EXPORTER_FIELD.DATE_OF_EXPORT]: '2023-06-01',
        [EXPORTER_FIELD.EXPORT_TONNAGE]: '20.0'
      }
    })

    // Suppose we had 30 credited, then 10 debited. Net 20.
    // If target is 20, delta should be 0.
    const existingCredit = {
      id: 'tx-1',
      type: WASTE_BALANCE_TRANSACTION_TYPE.CREDIT,
      amount: 30.0,
      entities: [
        {
          id: 'row-1',
          type: WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.WASTE_RECORD_RECEIVED,
          currentVersionId: 'v1',
          previousVersionIds: []
        }
      ],
      createdAt: '2023-01-01T00:00:00.000Z',
      createdBy: { id: 'user-1', name: 'Test User' },
      openingAmount: 0,
      closingAmount: 30.0,
      openingAvailableAmount: 0,
      closingAvailableAmount: 30.0
    }
    const existingDebit = {
      id: 'tx-2',
      type: WASTE_BALANCE_TRANSACTION_TYPE.DEBIT,
      amount: 10.0,
      entities: [
        {
          id: 'row-1',
          type: WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.WASTE_RECORD_RECEIVED,
          currentVersionId: 'v1',
          previousVersionIds: []
        }
      ],
      createdAt: '2023-01-02T00:00:00.000Z',
      createdBy: { id: 'user-1', name: 'Test User' },
      openingAmount: 30.0,
      closingAmount: 20.0,
      openingAvailableAmount: 30.0,
      closingAvailableAmount: 20.0
    }

    const currentBalance = {
      ...emptyBalance,
      transactions: [existingCredit, existingDebit]
    }

    const result = calculateWasteBalanceUpdates({
      currentBalance,
      wasteRecords: [record],
      accreditation
    })

    expect(result.newTransactions).toHaveLength(0)
  })

  it('Should handle missing transactions array in currentBalance', () => {
    const record = buildWasteRecord({
      data: {
        [EXPORTER_FIELD.PRN_ISSUED]: 'No',
        [EXPORTER_FIELD.DATE_OF_EXPORT]: '2023-06-01',
        [EXPORTER_FIELD.EXPORT_TONNAGE]: '10.0'
      }
    })

    const balance = { ...emptyBalance }
    delete balance.transactions

    const result = calculateWasteBalanceUpdates({
      currentBalance: balance,
      wasteRecords: [record],
      accreditation
    })

    expect(result.newTransactions).toHaveLength(1)
    expect(result.newTransactions[0].amount).toBe(10.0)
  })

  it('Should create DEBIT transaction when correcting downwards', () => {
    const record = buildWasteRecord({
      rowId: 'row-1',
      data: {
        [EXPORTER_FIELD.PRN_ISSUED]: 'No',
        [EXPORTER_FIELD.DATE_OF_EXPORT]: '2023-06-01',
        [EXPORTER_FIELD.EXPORT_TONNAGE]: '10.0'
      }
    })

    const existingTransaction = {
      id: 'tx-1',
      type: WASTE_BALANCE_TRANSACTION_TYPE.CREDIT,
      amount: 20.0,
      entities: [
        {
          id: 'row-1',
          type: WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.WASTE_RECORD_RECEIVED,
          currentVersionId: 'v1',
          previousVersionIds: []
        }
      ],
      createdAt: '2023-01-01T00:00:00.000Z',
      createdBy: { id: 'user-1', name: 'Test User' },
      openingAmount: 0,
      closingAmount: 20.0,
      openingAvailableAmount: 0,
      closingAvailableAmount: 20.0
    }

    const currentBalance = {
      ...emptyBalance,
      transactions: [existingTransaction]
    }

    const result = calculateWasteBalanceUpdates({
      currentBalance,
      wasteRecords: [record],
      accreditation
    })

    // Target 10, Credited 20. Delta -10.
    expect(result.newTransactions).toHaveLength(1)
    expect(result.newTransactions[0].amount).toBe(10.0)
    expect(result.newTransactions[0].type).toBe(
      WASTE_BALANCE_TRANSACTION_TYPE.DEBIT
    )
  })
  it('Should not create transaction if balance is already correct', () => {
    const record = buildWasteRecord({
      data: {
        [EXPORTER_FIELD.PRN_ISSUED]: 'No',
        [EXPORTER_FIELD.DATE_OF_EXPORT]: '2023-06-01',
        [EXPORTER_FIELD.EXPORT_TONNAGE]: '10.0'
      }
    })

    const existingTransaction = {
      id: 'tx-1',
      type: WASTE_BALANCE_TRANSACTION_TYPE.CREDIT,
      amount: 10.0,
      createdAt: '2023-06-01T10:00:00.000Z',
      createdBy: testUser,
      openingAmount: 0,
      closingAmount: 10.0,
      openingAvailableAmount: 0,
      closingAvailableAmount: 10.0,
      entities: [
        {
          id: record.rowId,
          type: WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.WASTE_RECORD_RECEIVED,
          currentVersionId: 'v1',
          previousVersionIds: []
        }
      ]
    }

    const result = calculateWasteBalanceUpdates({
      currentBalance: {
        ...emptyBalance,
        amount: 10.0,
        availableAmount: 10.0,
        transactions: [existingTransaction]
      },
      wasteRecords: [record],
      accreditation
    })

    expect(result.newTransactions).toHaveLength(0)
    expect(result.newAmount).toBe(10.0)
  })

  it('Should handle transactions with missing entities', () => {
    const balanceWithTransaction = {
      ...emptyBalance,
      amount: 10,
      availableAmount: 10,
      transactions: [
        {
          id: 'tx-1',
          type: WASTE_BALANCE_TRANSACTION_TYPE.CREDIT,
          amount: 10,
          createdAt: new Date().toISOString(),
          createdBy: { id: 'user-1', name: 'Test User' },
          openingAmount: 0,
          closingAmount: 10,
          openingAvailableAmount: 0,
          closingAvailableAmount: 10,
          entities: []
        }
      ]
    }

    const record = buildWasteRecord({
      rowId: 'row-1',
      data: {
        [EXPORTER_FIELD.PRN_ISSUED]: 'No',
        [EXPORTER_FIELD.DATE_OF_EXPORT]: '2023-06-01',
        [EXPORTER_FIELD.EXPORT_TONNAGE]: '10.0'
      }
    })

    const result = calculateWasteBalanceUpdates({
      currentBalance: balanceWithTransaction,
      wasteRecords: [record],
      accreditation
    })

    // Should create a new transaction because the existing one isn't linked to this record
    expect(result.newTransactions).toHaveLength(1)
    expect(result.newTransactions[0].amount).toBe(10.0)
  })

  describe('buildTransaction', async () => {
    const { buildTransaction } = await import('./calculator.js')

    const mockRecord = buildWasteRecord()

    it('should handle CREDIT transactions correctly', () => {
      const result = buildTransaction(
        mockRecord,
        100,
        500,
        500,
        WASTE_BALANCE_TRANSACTION_TYPE.CREDIT
      )

      expect(result.type).toBe(WASTE_BALANCE_TRANSACTION_TYPE.CREDIT)
      expect(result.amount).toBe(100)
      expect(result.openingAmount).toBe(500)
      expect(result.openingAvailableAmount).toBe(500)
      expect(result.closingAmount).toBe(600)
      expect(result.closingAvailableAmount).toBe(600)
    })

    it('should handle DEBIT transactions correctly', () => {
      const result = buildTransaction(
        mockRecord,
        100,
        500,
        500,
        WASTE_BALANCE_TRANSACTION_TYPE.DEBIT
      )

      expect(result.type).toBe(WASTE_BALANCE_TRANSACTION_TYPE.DEBIT)
      expect(result.amount).toBe(100)
      expect(result.openingAmount).toBe(500)
      expect(result.openingAvailableAmount).toBe(500)
      expect(result.closingAmount).toBe(400)
      expect(result.closingAvailableAmount).toBe(400)
    })

    describe('Transaction Scenarios', () => {
      it('Scenario 1: Credit followed by Debit', () => {
        // Initial state: 0
        const creditTx = buildTransaction(
          mockRecord,
          100,
          0,
          0,
          WASTE_BALANCE_TRANSACTION_TYPE.CREDIT
        )

        expect(creditTx.closingAmount).toBe(100)
        expect(creditTx.closingAvailableAmount).toBe(100)

        const debitTx = buildTransaction(
          mockRecord,
          30,
          creditTx.closingAmount,
          creditTx.closingAvailableAmount,
          WASTE_BALANCE_TRANSACTION_TYPE.DEBIT
        )

        expect(debitTx.openingAmount).toBe(100)
        expect(debitTx.closingAmount).toBe(70)
        expect(debitTx.closingAvailableAmount).toBe(70)
      })

      it('Scenario 2: Credit followed by Debit resulting in negative balance', () => {
        const creditTx = buildTransaction(
          mockRecord,
          50,
          0,
          0,
          WASTE_BALANCE_TRANSACTION_TYPE.CREDIT
        )

        const debitTx = buildTransaction(
          mockRecord,
          100,
          creditTx.closingAmount,
          creditTx.closingAvailableAmount,
          WASTE_BALANCE_TRANSACTION_TYPE.DEBIT
        )

        expect(debitTx.openingAmount).toBe(50)
        expect(debitTx.closingAmount).toBe(-50)
        expect(debitTx.closingAvailableAmount).toBe(-50)
      })
    })
  })

  describe('Version Handling', () => {
    it('Should populate previousVersionIds when multiple versions exist', () => {
      const record = buildWasteRecord({
        versions: [
          { id: 'v1', status: 'created' },
          { id: 'v2', status: 'created' },
          { id: 'v3', status: 'created' }
        ],
        data: {
          [EXPORTER_FIELD.PRN_ISSUED]: 'No',
          [EXPORTER_FIELD.DATE_OF_EXPORT]: '2023-06-01',
          [EXPORTER_FIELD.EXPORT_TONNAGE]: '10.0'
        }
      })

      const result = calculateWasteBalanceUpdates({
        currentBalance: emptyBalance,
        wasteRecords: [record],
        accreditation
      })

      expect(result.newTransactions).toHaveLength(1)
      const entity = result.newTransactions[0].entities[0]
      expect(entity.currentVersionId).toBe('v3')
      expect(entity.previousVersionIds).toEqual(['v1', 'v2'])
    })

    it('Should handle missing versions array', () => {
      const record = buildWasteRecord({
        data: {
          [EXPORTER_FIELD.PRN_ISSUED]: 'No',
          [EXPORTER_FIELD.DATE_OF_EXPORT]: '2023-06-01',
          [EXPORTER_FIELD.EXPORT_TONNAGE]: '10.0'
        }
      })
      delete record.versions

      const result = calculateWasteBalanceUpdates({
        currentBalance: emptyBalance,
        wasteRecords: [record],
        accreditation
      })

      expect(result.newTransactions).toHaveLength(1)
      const entity = result.newTransactions[0].entities[0]
      expect(entity.currentVersionId).toBeUndefined()
      expect(entity.previousVersionIds).toEqual([])
    })
  })

  describe('REPROCESSOR_INPUT', () => {
    const buildReprocessorInputRecord = (overrides = {}) => {
      return buildWasteRecord({
        type: WASTE_RECORD_TYPE.RECEIVED,
        ...overrides,
        data: {
          processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
          ...(overrides.data || {})
        }
      })
    }

    it('should calculate balance for REPROCESSOR_INPUT (Received only)', () => {
      const record = buildReprocessorInputRecord({
        type: WASTE_RECORD_TYPE.RECEIVED,
        data: {
          [REPROCESSOR_INPUT_FIELD.DATE_RECEIVED]: '2023-06-01',
          [REPROCESSOR_INPUT_FIELD.PRN_ISSUED]: 'No',
          [REPROCESSOR_INPUT_FIELD.RECEIVED_TONNAGE]: 100
        }
      })

      const result = calculateWasteBalanceUpdates({
        currentBalance: emptyBalance,
        wasteRecords: [record],
        accreditation
      })

      expect(result.newTransactions).toHaveLength(1)
      expect(result.newTransactions[0].amount).toBe(100)
      expect(result.newTransactions[0].type).toBe(
        WASTE_BALANCE_TRANSACTION_TYPE.CREDIT
      )
      expect(result.newAmount).toBe(100)
    })

    it('should calculate balance for REPROCESSOR_INPUT (Sent on only)', () => {
      const record = buildReprocessorInputRecord({
        type: WASTE_RECORD_TYPE.SENT_ON,
        data: {
          [REPROCESSOR_INPUT_FIELD.DATE_SENT_ON]: '2023-06-01',
          [REPROCESSOR_INPUT_FIELD.SENT_ON_TONNAGE]: 40
        }
      })

      const result = calculateWasteBalanceUpdates({
        currentBalance: emptyBalance,
        wasteRecords: [record],
        accreditation
      })

      expect(result.newTransactions).toHaveLength(1)
      expect(result.newTransactions[0].amount).toBe(40)
      expect(result.newTransactions[0].type).toBe(
        WASTE_BALANCE_TRANSACTION_TYPE.DEBIT
      )
      expect(result.newAmount).toBe(-40)
    })

    it('should throw error for unsupported record type', () => {
      const record = buildReprocessorInputRecord({
        type: 'UNSUPPORTED_TYPE',
        data: {
          [REPROCESSOR_INPUT_FIELD.DATE_RECEIVED]: '2023-06-01'
        }
      })

      expect(() =>
        calculateWasteBalanceUpdates({
          currentBalance: emptyBalance,
          wasteRecords: [record],
          accreditation
        })
      ).toThrow(
        'No mapping found for record type: UNSUPPORTED_TYPE in processingType: REPROCESSOR_INPUT'
      )
    })

    it('should calculate balance for REPROCESSOR_INPUT (Both Received and Sent on)', () => {
      const receivedRecord = buildReprocessorInputRecord({
        rowId: 'row-1',
        type: WASTE_RECORD_TYPE.RECEIVED,
        data: {
          [REPROCESSOR_INPUT_FIELD.DATE_RECEIVED]: '2023-06-01',
          [REPROCESSOR_INPUT_FIELD.PRN_ISSUED]: 'No',
          [REPROCESSOR_INPUT_FIELD.RECEIVED_TONNAGE]: 100
        }
      })

      const sentOnRecord = buildReprocessorInputRecord({
        rowId: 'row-2',
        type: WASTE_RECORD_TYPE.SENT_ON,
        data: {
          [REPROCESSOR_INPUT_FIELD.DATE_SENT_ON]: '2023-06-01',
          [REPROCESSOR_INPUT_FIELD.SENT_ON_TONNAGE]: 40
        }
      })

      const result = calculateWasteBalanceUpdates({
        currentBalance: emptyBalance,
        wasteRecords: [receivedRecord, sentOnRecord],
        accreditation
      })

      expect(result.newTransactions).toHaveLength(2)
      expect(result.newAmount).toBe(60)
    })

    it('should return 0 for unsupported processing types', () => {
      const record = {
        type: WASTE_RECORD_TYPE.RECEIVED,
        data: {
          processingType: 'UNSUPPORTED'
        }
      }
      expect(getTransactionAmount(record)).toBe(0)
    })

    it('should return 0 for unsupported record types in REPROCESSOR_INPUT', () => {
      const record = {
        type: 'UNSUPPORTED',
        data: {
          processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
        }
      }
      expect(getTransactionAmount(record)).toBe(0)
    })

    it('should handle missing tonnage fields for REPROCESSOR_INPUT', () => {
      const receivedRecord = {
        type: WASTE_RECORD_TYPE.RECEIVED,
        data: {
          processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
        }
      }
      const sentOnRecord = {
        type: WASTE_RECORD_TYPE.SENT_ON,
        data: {
          processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
        }
      }
      expect(getTransactionAmount(receivedRecord)).toBe(0)
      expect(getTransactionAmount(sentOnRecord)).toBe(0)
    })

    it('should handle missing entities in existing transactions', () => {
      const record = buildReprocessorInputRecord({
        rowId: 'row-1',
        data: {
          [REPROCESSOR_INPUT_FIELD.DATE_RECEIVED]: '2023-06-01',
          [REPROCESSOR_INPUT_FIELD.RECEIVED_TONNAGE]: 100
        }
      })

      const balanceWithNoEntities = {
        amount: 50,
        availableAmount: 50,
        transactions: [
          {
            type: WASTE_BALANCE_TRANSACTION_TYPE.CREDIT,
            amount: 50
            // entities missing
          }
        ]
      }

      const result = calculateWasteBalanceUpdates({
        currentBalance: balanceWithNoEntities,
        wasteRecords: [record],
        accreditation
      })

      // Since the existing transaction had no entities, it didn't count towards 'row-1'
      // So the delta for 'row-1' is 100 - 0 = 100
      expect(result.newTransactions).toHaveLength(1)
      expect(result.newTransactions[0].amount).toBe(100)
    })
  })

  describe('Coverage Tests', () => {
    it('getTransactionAmount should throw if extractFields throws a non-mapping error', () => {
      // Passing null will cause record.data?.processingType to throw TypeError
      expect(() => getTransactionAmount(null)).toThrow()
    })

    it('isWithinRange should return false for unknown processing type', () => {
      const result = isWithinRange(new Date(), {}, 'UNKNOWN_TYPE')
      expect(result).toBe(false)
    })

    it('getTransactionAmount should return amount for valid record', () => {
      const record = buildWasteRecord({
        data: {
          [EXPORTER_FIELD.DATE_OF_EXPORT]: '2023-06-01',
          [EXPORTER_FIELD.EXPORT_TONNAGE]: '10.5'
        }
      })
      expect(getTransactionAmount(record)).toBe(10.5)
    })
  })
})
