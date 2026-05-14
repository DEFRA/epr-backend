import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logger } from '#common/helpers/logging/logger.js'
import { BSON } from 'mongodb'
import { recordWasteBalanceGrowth } from './growth-observability.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '../domain/model.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn()
  }
}))

const buildBalance = (overrides = {}) => ({
  id: '00000000-0000-0000-0000-000000000001',
  accreditationId: 'acc-123',
  organisationId: 'org-1',
  amount: 0,
  availableAmount: 0,
  transactions: [],
  version: 1,
  schemaVersion: 1,
  canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED,
  ...overrides
})

const buildTransaction = (overrides = {}) => ({
  id: 'txn-1',
  type: 'credit',
  createdAt: '2026-05-14T00:00:00.000Z',
  createdBy: { id: 'user-1', name: 'user-1' },
  amount: 1,
  openingAmount: 0,
  closingAmount: 1,
  openingAvailableAmount: 0,
  closingAvailableAmount: 1,
  entities: [
    {
      id: 'wr-1',
      currentVersionId: 'wr-1',
      previousVersionIds: [],
      type: 'waste_record:received'
    }
  ],
  ...overrides
})

const messageOf = () => vi.mocked(logger.info).mock.calls[0][0].message

describe('recordWasteBalanceGrowth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('logs accreditationId and transaction counts', () => {
    const transactions = [buildTransaction(), buildTransaction({ id: 'txn-2' })]
    const updatedBalance = buildBalance({
      accreditationId: 'acc-xyz',
      transactions
    })

    recordWasteBalanceGrowth(updatedBalance, [transactions[1]])

    expect(logger.info).toHaveBeenCalledTimes(1)
    const message = messageOf()
    expect(message).toContain('Waste balance document growth')
    expect(message).toContain('accreditationId=acc-xyz')
    expect(message).toContain('transactionCount=2')
    expect(message).toContain('newTransactionCount=1')
  })

  it('reports the BSON size of the updated balance document', () => {
    const transactions = [buildTransaction()]
    const updatedBalance = buildBalance({ transactions })

    recordWasteBalanceGrowth(updatedBalance, transactions)

    const expectedSize = BSON.calculateObjectSize(updatedBalance)
    expect(messageOf()).toContain(`bsonSize=${expectedSize}`)
  })

  it('reports the BSON size as a percentage of the 16MB document limit', () => {
    const transactions = [buildTransaction()]
    const updatedBalance = buildBalance({ transactions })

    recordWasteBalanceGrowth(updatedBalance, transactions)

    const expectedSize = BSON.calculateObjectSize(updatedBalance)
    const expectedPercent =
      Math.round((expectedSize / (16 * 1024 * 1024)) * 10000) / 100

    expect(messageOf()).toContain(`percentOfBsonLimit=${expectedPercent}`)
  })

  it('reports a percentage near zero when the document is empty', () => {
    const updatedBalance = buildBalance({ transactions: [] })

    recordWasteBalanceGrowth(updatedBalance, [])

    const message = messageOf()
    expect(message).toContain('transactionCount=0')
    expect(message).toContain('newTransactionCount=0')
    const percentMatch = message.match(/percentOfBsonLimit=([\d.]+)/)
    expect(percentMatch).not.toBeNull()
    const percent = Number(percentMatch[1])
    expect(percent).toBeLessThan(0.01)
    expect(percent).toBeGreaterThanOrEqual(0)
  })
})
