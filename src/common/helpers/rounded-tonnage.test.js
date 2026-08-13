import { describe, expect, it } from 'vitest'

import { toNumber } from './decimal-utils.js'
import {
  ZERO_TONNAGE,
  addTonnage,
  toRoundedTonnage
} from './rounded-tonnage.js'

describe('toRoundedTonnage', () => {
  it('accepts a value already held to two decimal places', () => {
    expect(toNumber(toRoundedTonnage(9.13))).toBe(9.13)
  })

  it('accepts values with fewer than two decimal places', () => {
    expect(toNumber(toRoundedTonnage(146.7))).toBe(146.7)
    expect(toNumber(toRoundedTonnage(44))).toBe(44)
  })

  it('reads a nullish stored field as zero', () => {
    expect(toNumber(toRoundedTonnage(null))).toBe(0)
    expect(toNumber(toRoundedTonnage(undefined))).toBe(0)
  })

  it('rejects a value carrying more than two decimal places', () => {
    expect(() => toRoundedTonnage(9.126)).toThrow(/two decimal places/)
  })

  it('rejects a non-numeric value', () => {
    expect(() => toRoundedTonnage('9.13')).toThrow(/two decimal places/)
  })
})

describe('addTonnage', () => {
  it('sums two rounded tonnages exactly', () => {
    const sum = addTonnage(toRoundedTonnage(9.13), toRoundedTonnage(0.87))
    expect(toNumber(sum)).toBe(10)
  })

  it('stays exact across a running total of stored 2dp values', () => {
    const total = [1.01, 2.02, 3.03, 0.94].reduce(
      (acc, value) => addTonnage(acc, toRoundedTonnage(value)),
      ZERO_TONNAGE
    )
    expect(toNumber(total)).toBe(7)
  })

  it('produces a rounded tonnage that feeds back into the sum', () => {
    const running = addTonnage(toRoundedTonnage(1.11), toRoundedTonnage(2.22))
    const total = addTonnage(running, toRoundedTonnage(0.67))
    expect(toNumber(total)).toBe(4)
  })
})
