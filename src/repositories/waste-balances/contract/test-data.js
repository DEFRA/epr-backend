import { randomUUID } from 'node:crypto'
import {
  WASTE_BALANCE_TRANSACTION_TYPE,
  WASTE_BALANCE_TRANSACTION_ENTITY_TYPE
} from '#domain/waste-balances/model.js'

/**
 * Build a minimal waste balance for testing
 * @param {Partial<import('#domain/waste-balances/model.js').WasteBalance>} [overrides] - Optional overrides for the waste balance
 * @returns {import('#domain/waste-balances/model.js').WasteBalance}
 */
export const buildWasteBalance = (overrides = {}) => {
  const _id = overrides._id ?? randomUUID()
  const organisationId = overrides.organisationId ?? 'org-1'
  const accreditationId = overrides.accreditationId ?? 'acc-1'
  const schemaVersion = overrides.schemaVersion ?? 1
  const version = overrides.version ?? 1
  const amount = overrides.amount ?? 100
  const availableAmount = overrides.availableAmount ?? 100

  const transaction = {
    _id: randomUUID(),
    type: WASTE_BALANCE_TRANSACTION_TYPE.CREDIT,
    createdAt: new Date('2025-01-15T10:00:00.000Z').toISOString(),
    createdBy: {
      id: 'user-1'
    },
    amount: 100,
    openingAmount: 0,
    closingAmount: 100,
    openingAvailableAmount: 0,
    closingAvailableAmount: 100,
    entities: [
      {
        id: 'waste-record-1',
        type: WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.WASTE_RECORD_RECEIVED
      }
    ]
  }

  return {
    _id,
    organisationId,
    accreditationId,
    schemaVersion,
    version,
    amount,
    availableAmount,
    transactions: overrides.transactions || [transaction],
    ...overrides
  }
}
