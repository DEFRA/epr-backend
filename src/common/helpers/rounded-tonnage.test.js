import { describe, expect, it } from 'vitest'

import { toNumber } from './decimal-utils.js'
import {
  ZERO_TONNAGE,
  addTonnage,
  subtractTonnage,
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

describe('subtractTonnage', () => {
  it('takes one rounded tonnage from another exactly', () => {
    const remainder = subtractTonnage(
      toRoundedTonnage(29.19),
      toRoundedTonnage(0.19)
    )

    expect(toNumber(remainder)).toBe(29)
  })

  it('stays exact where floating-point subtraction would drift', () => {
    const remainder = subtractTonnage(
      toRoundedTonnage(0.3),
      toRoundedTonnage(0.1)
    )

    expect(toNumber(remainder)).toBe(0.2)
  })

  it('yields a negative tonnage when the subtrahend is larger', () => {
    const remainder = subtractTonnage(
      toRoundedTonnage(5),
      toRoundedTonnage(8.25)
    )

    expect(toNumber(remainder)).toBe(-3.25)
  })

  it('produces a rounded tonnage that feeds back into a sum', () => {
    const remainder = subtractTonnage(
      toRoundedTonnage(10),
      toRoundedTonnage(6.5)
    )
    const total = addTonnage(ZERO_TONNAGE, remainder)

    expect(toNumber(total)).toBe(3.5)
  })
})
