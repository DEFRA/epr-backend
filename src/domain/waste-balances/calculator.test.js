import { describe, it, expect } from 'vitest'
import { calculateWasteBalanceUpdates } from './calculator.js'
import { EXPORTER_FIELD } from './constants.js'
import {
  WASTE_RECORD_TYPE,
  VERSION_STATUS
} from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

const buildWasteRecord = (overrides = {}) => {
  const defaultData = {
    processingType: PROCESSING_TYPES.EXPORTER,
    [EXPORTER_FIELD.PRN_ISSUED]: 'No',
    [EXPORTER_FIELD.INTERIM_SITE]: 'No',
    [EXPORTER_FIELD.EXPORT_TONNAGE]: 10,
    [EXPORTER_FIELD.INTERIM_TONNAGE]: 0,
    'Date Received': '2025-01-20'
  }

  return {
    organisationId: 'org-1',
    registrationId: 'reg-1',
    accreditationId: 'acc-1',
    rowId: 'row-1',
    type: WASTE_RECORD_TYPE.RECEIVED,
    versions: [
      {
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
        [EXPORTER_FIELD.DATE_OF_DISPATCH]: '2023-06-01',
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
        [EXPORTER_FIELD.DATE_OF_DISPATCH]: '2023-06-01',
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
        [EXPORTER_FIELD.DATE_OF_DISPATCH]: '2023-06-01',
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
        [EXPORTER_FIELD.DATE_OF_DISPATCH]: '2022-12-31', // Before validFrom
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
      data: {
        [EXPORTER_FIELD.PRN_ISSUED]: 'No',
        [EXPORTER_FIELD.DATE_OF_DISPATCH]: '2023-06-01',
        [EXPORTER_FIELD.EXPORT_TONNAGE]: '10.0'
      }
    })
    const record2 = buildWasteRecord({
      data: {
        [EXPORTER_FIELD.PRN_ISSUED]: 'No',
        [EXPORTER_FIELD.DATE_OF_DISPATCH]: '2023-07-01',
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
        [EXPORTER_FIELD.DATE_OF_DISPATCH]: '2023-06-01',
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
        // DATE_OF_DISPATCH missing
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
        [EXPORTER_FIELD.DATE_OF_DISPATCH]: '2023-06-01',
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
        [EXPORTER_FIELD.DATE_OF_DISPATCH]: '2023-06-01',
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
        [EXPORTER_FIELD.DATE_OF_DISPATCH]: '2023-06-01',
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

  describe('buildTransaction', async () => {
    const { buildTransaction } = await import('./calculator.js')
    const { WASTE_BALANCE_TRANSACTION_TYPE } =
      await import('#domain/waste-balances/model.js')

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

    it('should handle PENDING_DEBIT transactions correctly', () => {
      const result = buildTransaction(
        mockRecord,
        100,
        500,
        500,
        WASTE_BALANCE_TRANSACTION_TYPE.PENDING_DEBIT
      )

      expect(result.type).toBe(WASTE_BALANCE_TRANSACTION_TYPE.PENDING_DEBIT)
      expect(result.amount).toBe(100)
      expect(result.openingAmount).toBe(500)
      expect(result.openingAvailableAmount).toBe(500)
      expect(result.closingAmount).toBe(500) // Balance should not change
      expect(result.closingAvailableAmount).toBe(400) // Available should decrease
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

      it('Scenario 2: Credit followed by Pending Debit', () => {
        const creditTx = buildTransaction(
          mockRecord,
          100,
          0,
          0,
          WASTE_BALANCE_TRANSACTION_TYPE.CREDIT
        )

        const pendingTx = buildTransaction(
          mockRecord,
          40,
          creditTx.closingAmount,
          creditTx.closingAvailableAmount,
          WASTE_BALANCE_TRANSACTION_TYPE.PENDING_DEBIT
        )

        expect(pendingTx.openingAmount).toBe(100)
        expect(pendingTx.closingAmount).toBe(100) // Balance unchanged
        expect(pendingTx.closingAvailableAmount).toBe(60) // Available reduced
      })

      it('Scenario 3: Credit followed by Debit resulting in negative balance', () => {
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

      it('Scenario 4: Complex sequence (Credit -> Pending Debit -> Debit)', () => {
        // 1. Credit 100
        const tx1 = buildTransaction(
          mockRecord,
          100,
          0,
          0,
          WASTE_BALANCE_TRANSACTION_TYPE.CREDIT
        )
        expect(tx1.closingAmount).toBe(100)
        expect(tx1.closingAvailableAmount).toBe(100)

        // 2. Pending Debit 20 (Reserves 20)
        const tx2 = buildTransaction(
          mockRecord,
          20,
          tx1.closingAmount,
          tx1.closingAvailableAmount,
          WASTE_BALANCE_TRANSACTION_TYPE.PENDING_DEBIT
        )
        expect(tx2.closingAmount).toBe(100)
        expect(tx2.closingAvailableAmount).toBe(80)

        // 3. Debit 50 (Reduces both)
        const tx3 = buildTransaction(
          mockRecord,
          50,
          tx2.closingAmount,
          tx2.closingAvailableAmount,
          WASTE_BALANCE_TRANSACTION_TYPE.DEBIT
        )
        expect(tx3.closingAmount).toBe(50)
        expect(tx3.closingAvailableAmount).toBe(30)
      })
    })
  })
})
