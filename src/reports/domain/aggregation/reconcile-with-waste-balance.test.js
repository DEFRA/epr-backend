import { describe, it, expect } from 'vitest'

import {
  add,
  addRounded,
  roundToTwoDecimalPlaces,
  toDecimal,
  toNumber
} from '#common/helpers/decimal-utils.js'
import { coerceStoredTonnages } from '#waste-records/application/stored-tonnage-coercion.js'
import { groupAndSum } from './helpers.js'

/**
 * The waste balance credits each load rounded to two decimal places and sums
 * those (round-each-then-sum, ADR 0027/0028). Report aggregation reads the
 * summary-log row-state collection, where those same tonnages are already
 * stored rounded to two decimal places, and sums them exactly. The two totals
 * must agree to the penny for the same loads — the report is a view of the
 * balance, not a second rounding regime.
 *
 * The tonnages below are full precision and chosen so that a naive
 * sum-then-round of the raw figures drifts from the round-each total; the point
 * is that the aggregation never sees the full-precision figures, only the
 * stored two-decimal-place ones.
 */
describe('report aggregation reconciles with the waste balance', () => {
  const fullPrecisionTonnages = [1.005, 2.005, 3.004, 0.006]

  const wasteBalanceTotal = toNumber(
    fullPrecisionTonnages.reduce(
      (acc, t) => addRounded(acc, t, 2),
      toDecimal(0)
    )
  )

  const storedTonnages = fullPrecisionTonnages.map(
    (t) =>
      coerceStoredTonnages({ TONNAGE_RECEIVED_FOR_RECYCLING: t })
        .TONNAGE_RECEIVED_FOR_RECYCLING
  )

  it('groupAndSum totals the stored 2dp tonnages to the amount the waste balance credits', () => {
    const [group] = groupAndSum(
      storedTonnages.map((tonnage) => ({ tonnage })),
      () => 'one-group',
      () => ({}),
      ({ tonnage }) => tonnage
    )

    expect(toNumber(group.tonnageDecimal)).toBe(wasteBalanceTotal)
  })

  it('leaves no residual — exact-summing the stored 2dp values needs no final rounding', () => {
    const exactSum = toNumber(
      storedTonnages.reduce((acc, v) => add(acc, v), toDecimal(0))
    )

    expect(exactSum).toBe(wasteBalanceTotal)
    expect(roundToTwoDecimalPlaces(exactSum)).toBe(exactSum)
  })

  it('is a genuine reconciliation — sum-then-round of the raw figures would drift', () => {
    const naiveSumThenRound = roundToTwoDecimalPlaces(
      fullPrecisionTonnages.reduce((acc, t) => add(acc, t), toDecimal(0))
    )

    expect(naiveSumThenRound).not.toBe(wasteBalanceTotal)
  })
})
