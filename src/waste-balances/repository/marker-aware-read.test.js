import { describe, it, expect, vi } from 'vitest'

import { resolveBalanceAmounts } from './marker-aware-read.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '../domain/model.js'

const buildBalance = (overrides = {}) => ({
  accreditationId: 'acc-1',
  organisationId: 'org-1',
  amount: 100,
  availableAmount: 80,
  canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED,
  transactions: [],
  ...overrides
})

const buildLedger = (latest) => ({
  findLatestByAccreditationId: vi.fn().mockResolvedValue(latest)
})

describe('resolveBalanceAmounts', () => {
  it('leaves an embedded balance unchanged', async () => {
    const balance = buildBalance({
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED,
      amount: 100,
      availableAmount: 80
    })
    const ledger = buildLedger(null)

    const result = await resolveBalanceAmounts(balance, ledger)

    expect(result).toEqual(balance)
    expect(ledger.findLatestByAccreditationId).not.toHaveBeenCalled()
  })

  it('leaves a migrating balance unchanged', async () => {
    const balance = buildBalance({
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING,
      amount: 50,
      availableAmount: 30
    })
    const ledger = buildLedger(null)

    const result = await resolveBalanceAmounts(balance, ledger)

    expect(result.amount).toBe(50)
    expect(result.availableAmount).toBe(30)
    expect(ledger.findLatestByAccreditationId).not.toHaveBeenCalled()
  })

  it('substitutes amounts from the latest ledger transaction when marker is ledger', async () => {
    const balance = buildBalance({
      accreditationId: 'acc-ledger',
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER,
      amount: 999,
      availableAmount: 999
    })
    const ledger = buildLedger({
      number: 5,
      closingBalance: { amount: 200, availableAmount: 175 }
    })

    const result = await resolveBalanceAmounts(balance, ledger)

    expect(ledger.findLatestByAccreditationId).toHaveBeenCalledWith(
      'acc-ledger'
    )
    expect(result.amount).toBe(200)
    expect(result.availableAmount).toBe(175)
  })

  it('returns zero amounts when marker is ledger but no ledger transaction exists', async () => {
    const balance = buildBalance({
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER,
      amount: 999,
      availableAmount: 999
    })
    const ledger = buildLedger(null)

    const result = await resolveBalanceAmounts(balance, ledger)

    expect(result.amount).toBe(0)
    expect(result.availableAmount).toBe(0)
  })

  it('throws when marker is ledger and no ledger repository is wired', async () => {
    const balance = buildBalance({
      accreditationId: 'acc-no-ledger',
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
    })

    await expect(resolveBalanceAmounts(balance, undefined)).rejects.toThrow(
      /acc-no-ledger/
    )
  })

  it('does not require a ledger repository when marker is embedded', async () => {
    const balance = buildBalance({
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED,
      amount: 42,
      availableAmount: 21
    })

    const result = await resolveBalanceAmounts(balance, undefined)

    expect(result.amount).toBe(42)
    expect(result.availableAmount).toBe(21)
  })

  it('preserves all non-amount fields', async () => {
    const balance = buildBalance({
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER,
      transactions: [{ id: 't1' }],
      version: 7,
      migratingSince: undefined
    })
    const ledger = buildLedger({
      closingBalance: { amount: 10, availableAmount: 10 }
    })

    const result = await resolveBalanceAmounts(balance, ledger)

    expect(result.transactions).toEqual([{ id: 't1' }])
    expect(result.version).toBe(7)
    expect(result.canonicalSource).toBe(WASTE_BALANCE_CANONICAL_SOURCE.LEDGER)
  })
})
