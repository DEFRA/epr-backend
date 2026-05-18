import { describe, it, expect, vi } from 'vitest'

import { resolveBalanceAmounts } from './marker-aware-read.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '../domain/model.js'

const buildBalance = (overrides = {}) => ({
  accreditationId: 'acc-1',
  registrationId: 'reg-1',
  organisationId: 'org-1',
  amount: 100,
  availableAmount: 80,
  canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED,
  transactions: [],
  ...overrides
})

const buildStream = (latest) => ({
  findLatestByPartition: vi.fn().mockResolvedValue(latest)
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

  it('throws when marker is ledger but no stream events exist', async () => {
    const balance = buildBalance({
      accreditationId: 'acc-empty',
      registrationId: 'reg-empty',
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER,
      amount: 999,
      availableAmount: 999
    })
    const stream = buildStream(null)

    await expect(resolveBalanceAmounts(balance, stream)).rejects.toThrow(
      /acc-empty.*canonicalSource 'ledger' but no stream events/
    )
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
