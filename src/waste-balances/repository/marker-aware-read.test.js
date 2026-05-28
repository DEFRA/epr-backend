import { describe, it, expect, vi } from 'vitest'

import { resolveBalanceAmounts } from './marker-aware-read.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '../domain/model.js'

const buildBalance = (overrides = {}) => ({
  id: 'bal-1',
  accreditationId: 'acc-1',
  registrationId: 'reg-1',
  organisationId: 'org-1',
  amount: 100,
  availableAmount: 80,
  canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED,
  transactions: [],
  version: 1,
  schemaVersion: 1,
  ...overrides
})

/**
 * Test helper: accepts partial stream events since tests only exercise specific
 * fields (e.g. closingBalance). Casts to StreamEvent so the returned repository
 * satisfies the port type.
 *
 * @param {Partial<import('./stream-schema.js').StreamEvent> | null} latest
 * @returns {import('./stream-port.js').WasteBalanceStreamRepository}
 */
const buildStream = (latest) => ({
  findLatestByPartition: vi
    .fn()
    .mockResolvedValue(
      /** @type {import('./stream-schema.js').StreamEvent | null} */ (latest)
    ),
  findLatestByPartitionAndKind: vi.fn().mockResolvedValue(null),
  findEventsByPrnIdAfter: vi.fn().mockResolvedValue([]),
  appendEvent: vi.fn().mockResolvedValue(undefined),
  deleteByPartition: vi.fn().mockResolvedValue(0),
  bulkAppendEvents: vi.fn().mockResolvedValue([])
})

describe('resolveBalanceAmounts', () => {
  it('leaves an embedded balance unchanged', async () => {
    const balance = buildBalance({
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED,
      amount: 100,
      availableAmount: 80
    })
    const stream = buildStream(null)

    const result = await resolveBalanceAmounts(balance, stream)

    expect(result).toEqual(balance)
    expect(stream.findLatestByPartition).not.toHaveBeenCalled()
  })

  it('leaves a migrating balance unchanged', async () => {
    const balance = buildBalance({
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING,
      amount: 50,
      availableAmount: 30
    })
    const stream = buildStream(null)

    const result = await resolveBalanceAmounts(balance, stream)

    expect(result.amount).toBe(50)
    expect(result.availableAmount).toBe(30)
    expect(stream.findLatestByPartition).not.toHaveBeenCalled()
  })

  it('substitutes amounts from the latest stream event when marker is ledger', async () => {
    const balance = buildBalance({
      accreditationId: 'acc-ledger',
      registrationId: 'reg-ledger',
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER,
      amount: 999,
      availableAmount: 999
    })
    const stream = buildStream({
      number: 5,
      closingBalance: { amount: 200, availableAmount: 175 }
    })

    const result = await resolveBalanceAmounts(balance, stream)

    expect(stream.findLatestByPartition).toHaveBeenCalledWith(
      'reg-ledger',
      'acc-ledger'
    )
    expect(result.amount).toBe(200)
    expect(result.availableAmount).toBe(175)
  })

  it('returns zero balances when marker is ledger but stream is empty', async () => {
    const balance = buildBalance({
      accreditationId: 'acc-empty',
      registrationId: 'reg-empty',
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER,
      amount: 999,
      availableAmount: 999
    })
    const stream = buildStream(null)

    const result = await resolveBalanceAmounts(balance, stream)

    expect(result.amount).toBe(0)
    expect(result.availableAmount).toBe(0)
  })

  it('preserves all non-amount fields', async () => {
    const balance = buildBalance({
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER,
      transactions: [{ id: 't1' }],
      version: 7,
      migratingSince: undefined
    })
    const stream = buildStream({
      closingBalance: { amount: 10, availableAmount: 10 }
    })

    const result = await resolveBalanceAmounts(balance, stream)

    expect(result.transactions).toEqual([{ id: 't1' }])
    expect(result.version).toBe(7)
    expect(result.canonicalSource).toBe(WASTE_BALANCE_CANONICAL_SOURCE.LEDGER)
  })
})
