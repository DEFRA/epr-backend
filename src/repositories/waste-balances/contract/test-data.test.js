import { describe, it, expect } from 'vitest'
import { buildWasteBalance } from './test-data.js'
import {
  WASTE_BALANCE_TRANSACTION_TYPE,
  WASTE_BALANCE_TRANSACTION_ENTITY_TYPE
} from '#domain/waste-records/model.js'

describe('buildWasteBalance', () => {
  it('generates a waste balance with default values', () => {
    const balance = buildWasteBalance()

    expect(balance._id).toBeDefined()
    expect(balance.organisationId).toBe('org-1')
    expect(balance.accreditationId).toBe('acc-1')
    expect(balance.schemaVersion).toBe(1)
    expect(balance.version).toBe(1)
    expect(balance.amount).toBe(100)
    expect(balance.availableAmount).toBe(100)
    expect(balance.transactions).toHaveLength(1)
  })

  it('generates waste balance with transaction defaults', () => {
    const balance = buildWasteBalance()

    const transaction = balance.transactions[0]
    expect(transaction._id).toBeDefined()
    expect(transaction.type).toBe(WASTE_BALANCE_TRANSACTION_TYPE.CREDIT)
    expect(transaction.createdAt).toBe('2025-01-15T10:00:00.000Z')
    expect(transaction.createdBy.id).toBe('user-1')
    expect(transaction.amount).toBe(100)
    expect(transaction.openingAmount).toBe(0)
    expect(transaction.closingAmount).toBe(100)
    expect(transaction.openingAvailableAmount).toBe(0)
    expect(transaction.closingAvailableAmount).toBe(100)
    expect(transaction.entities).toHaveLength(1)
    expect(transaction.entities[0].id).toBe('waste-record-1')
    expect(transaction.entities[0].type).toBe(
      WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.WASTE_RECORD_RECEIVED
    )
  })

  it('applies custom _id when provided', () => {
    const customId = 'custom-id-123'
    const balance = buildWasteBalance({ _id: customId })

    expect(balance._id).toBe(customId)
  })

  it('applies custom organisationId when provided', () => {
    const balance = buildWasteBalance({ organisationId: 'org-custom' })

    expect(balance.organisationId).toBe('org-custom')
  })

  it('applies custom accreditationId when provided', () => {
    const balance = buildWasteBalance({ accreditationId: 'acc-custom' })

    expect(balance.accreditationId).toBe('acc-custom')
  })

  it('applies custom schemaVersion when provided', () => {
    const balance = buildWasteBalance({ schemaVersion: 2 })

    expect(balance.schemaVersion).toBe(2)
  })

  it('applies custom version when provided', () => {
    const balance = buildWasteBalance({ version: 5 })

    expect(balance.version).toBe(5)
  })

  it('applies custom amount when provided', () => {
    const balance = buildWasteBalance({ amount: 250 })

    expect(balance.amount).toBe(250)
  })

  it('applies custom availableAmount when provided', () => {
    const balance = buildWasteBalance({ availableAmount: 75 })

    expect(balance.availableAmount).toBe(75)
  })

  it('applies custom transactions when provided', () => {
    const customTransactions = [
      {
        _id: 'txn-1',
        type: WASTE_BALANCE_TRANSACTION_TYPE.DEBIT,
        createdAt: '2025-01-16T10:00:00.000Z',
        createdBy: { id: 'user-2' },
        amount: 50,
        openingAmount: 100,
        closingAmount: 50,
        openingAvailableAmount: 100,
        closingAvailableAmount: 50,
        entities: []
      }
    ]
    const balance = buildWasteBalance({ transactions: customTransactions })

    expect(balance.transactions).toEqual(customTransactions)
  })

  it('uses nullish coalescing for _id allowing empty string', () => {
    const balance = buildWasteBalance({ _id: '' })

    expect(balance._id).toBe('')
  })

  it('uses nullish coalescing for organisationId allowing empty string', () => {
    const balance = buildWasteBalance({ organisationId: '' })

    expect(balance.organisationId).toBe('')
  })

  it('uses nullish coalescing for accreditationId allowing empty string', () => {
    const balance = buildWasteBalance({ accreditationId: '' })

    expect(balance.accreditationId).toBe('')
  })

  it('uses nullish coalescing for schemaVersion allowing 0', () => {
    const balance = buildWasteBalance({ schemaVersion: 0 })

    expect(balance.schemaVersion).toBe(0)
  })

  it('uses nullish coalescing for version allowing 0', () => {
    const balance = buildWasteBalance({ version: 0 })

    expect(balance.version).toBe(0)
  })

  it('uses nullish coalescing for amount allowing 0', () => {
    const balance = buildWasteBalance({ amount: 0 })

    expect(balance.amount).toBe(0)
  })

  it('uses nullish coalescing for availableAmount allowing 0', () => {
    const balance = buildWasteBalance({ availableAmount: 0 })

    expect(balance.availableAmount).toBe(0)
  })
})
