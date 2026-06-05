import { describe, it, expect } from 'vitest'

import { resolveBalanceAmounts } from './resolve-balance-amounts.js'
import { createInMemoryStreamRepository } from './stream-inmemory.js'
import { buildStreamEvent } from './stream-test-data.js'

const buildBalance = (overrides = {}) => ({
  id: 'bal-1',
  accreditationId: 'acc-1',
  registrationId: 'reg-1',
  organisationId: 'org-1',
  amount: 100,
  availableAmount: 80,
  version: 1,
  schemaVersion: 1,
  ...overrides
})

describe('resolveBalanceAmounts', () => {
  it('substitutes amounts from the latest stream event', async () => {
    const balance = buildBalance({
      accreditationId: 'acc-ledger',
      registrationId: 'reg-ledger',
      amount: 999,
      availableAmount: 999
    })
    const stream = createInMemoryStreamRepository()()
    await stream.appendEvent(
      buildStreamEvent({
        accreditationId: 'acc-ledger',
        registrationId: 'reg-ledger',
        number: 1,
        closingBalance: { amount: 120, availableAmount: 100 }
      })
    )
    await stream.appendEvent(
      buildStreamEvent({
        accreditationId: 'acc-ledger',
        registrationId: 'reg-ledger',
        number: 2,
        closingBalance: { amount: 200, availableAmount: 175 }
      })
    )

    const result = await resolveBalanceAmounts(balance, stream)

    expect(result.amount).toBe(200)
    expect(result.availableAmount).toBe(175)
  })

  it('returns zero balances when the stream is empty', async () => {
    const balance = buildBalance({
      accreditationId: 'acc-empty',
      registrationId: 'reg-empty',
      amount: 999,
      availableAmount: 999
    })
    const stream = createInMemoryStreamRepository()()

    const result = await resolveBalanceAmounts(balance, stream)

    expect(result.amount).toBe(0)
    expect(result.availableAmount).toBe(0)
  })

  it('preserves all non-amount fields', async () => {
    const balance = buildBalance({
      accreditationId: 'acc-fields',
      registrationId: 'reg-fields',
      version: 7
    })
    const stream = createInMemoryStreamRepository()()
    await stream.appendEvent(
      buildStreamEvent({
        accreditationId: 'acc-fields',
        registrationId: 'reg-fields',
        number: 1,
        closingBalance: { amount: 10, availableAmount: 10 }
      })
    )

    const result = await resolveBalanceAmounts(balance, stream)

    expect(result.id).toBe('bal-1')
    expect(result.organisationId).toBe('org-1')
    expect(result.version).toBe(7)
  })
})
