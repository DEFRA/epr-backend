import { describe, it, expect } from 'vitest'

import { POOL } from '../repository/ledger-schema.js'
import { availableForPool, amountForPool } from './pool-balances.js'

describe('availableForPool', () => {
  const balance = {
    amount: 1000,
    availableAmount: 800,
    decemberAmount: 300,
    decemberAvailableAmount: 250
  }

  it('draws the December available amount for a December raise', () => {
    expect(availableForPool(balance, POOL.DECEMBER)).toBe(250)
  })

  it('draws the derived non-December available for a general raise, reserving December', () => {
    expect(availableForPool(balance, POOL.GENERAL)).toBe(550)
  })

  it('treats absent December fields as zero, so a general balance is unchanged', () => {
    expect(
      availableForPool({ amount: 500, availableAmount: 400 }, POOL.GENERAL)
    ).toBe(400)
  })

  it('resolves the December pool to zero when a balance carries none', () => {
    expect(
      availableForPool({ amount: 500, availableAmount: 400 }, POOL.DECEMBER)
    ).toBe(0)
  })
})

describe('amountForPool', () => {
  const balance = {
    amount: 1000,
    availableAmount: 800,
    decemberAmount: 300,
    decemberAvailableAmount: 250
  }

  it('draws the December amount for a December issue', () => {
    expect(amountForPool(balance, POOL.DECEMBER)).toBe(300)
  })

  it('draws the derived non-December amount for a general issue', () => {
    expect(amountForPool(balance, POOL.GENERAL)).toBe(700)
  })

  it('treats absent December fields as zero', () => {
    expect(
      amountForPool({ amount: 500, availableAmount: 400 }, POOL.GENERAL)
    ).toBe(500)
  })

  it('resolves the December pool to zero when a balance carries none', () => {
    expect(
      amountForPool({ amount: 500, availableAmount: 400 }, POOL.DECEMBER)
    ).toBe(0)
  })
})
