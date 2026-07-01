import { add, roundToTwoDecimalPlaces } from '#common/helpers/decimal-utils.js'
import { groupAndSum } from './helpers.js'

/**
 * Regression coverage for PAE-1668: report tonnage aggregation must round each
 * row to 2dp before summing (round-each-then-sum), matching the waste-balance
 * convention (ADR 0027/0028). The inputs below are chosen so that
 * sum-then-round and round-each-then-sum produce different totals.
 *
 * Per row: 1.005 -> 1.01 and 2.005 -> 2.01 (ROUND_HALF_UP).
 *   round-each-then-sum: 1.01 + 2.01 = 3.02
 *   sum-then-round:      round(1.005 + 2.005) = round(3.01) = 3.01
 *
 * The standalone accumulators (totals, refused/stopped, repatriated,
 * sumByFacilityType) are regression-covered end to end by exporter.test.js and
 * reprocessor.test.js, whose multi-decimal fixtures exercise the same divergence.
 */
describe('report aggregation round-each-then-sum (PAE-1668)', () => {
  it('demonstrates the two methods genuinely diverge for the chosen inputs', () => {
    expect(roundToTwoDecimalPlaces(add(1.005, 2.005))).toBe(3.01)
  })

  describe('groupAndSum', () => {
    it('rounds each row to 2dp before summing within a group', () => {
      const items = [{ t: 1.005 }, { t: 2.005 }]

      const [group] = groupAndSum(
        items,
        () => 'same-key',
        () => ({ label: 'group' }),
        (item) => item.t
      )

      // round-each-then-sum: 1.01 + 2.01 = 3.02 (not 3.01)
      expect(group.tonnageDecimal.toNumber()).toBe(3.02)
    })

    it('rounds a single-row group (the seed) to 2dp', () => {
      const [group] = groupAndSum(
        [{ t: 1.005 }],
        () => 'same-key',
        () => ({}),
        (item) => item.t
      )

      expect(group.tonnageDecimal.toNumber()).toBe(1.01)
    })
  })
})
