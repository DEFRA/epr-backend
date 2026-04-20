import { describe, it, expect } from 'vitest'
import { formatPeriodLabel } from './period-labels.js'

describe('formatPeriodLabel', () => {
  describe('monthly cadence', () => {
    it.each([
      [1, 'Jan 2026'],
      [2, 'Feb 2026'],
      [3, 'Mar 2026'],
      [4, 'Apr 2026'],
      [5, 'May 2026'],
      [6, 'Jun 2026'],
      [7, 'Jul 2026'],
      [8, 'Aug 2026'],
      [9, 'Sep 2026'],
      [10, 'Oct 2026'],
      [11, 'Nov 2026'],
      [12, 'Dec 2026']
    ])('period %i → %s', (period, expected) => {
      expect(formatPeriodLabel('monthly', period, 2026)).toBe(expected)
    })

    it('includes the correct year', () => {
      expect(formatPeriodLabel('monthly', 6, 2025)).toBe('Jun 2025')
    })
  })

  describe('quarterly cadence', () => {
    it.each([
      [1, 'Q1 2026'],
      [2, 'Q2 2026'],
      [3, 'Q3 2026'],
      [4, 'Q4 2026']
    ])('period %i → %s', (period, expected) => {
      expect(formatPeriodLabel('quarterly', period, 2026)).toBe(expected)
    })

    it('includes the correct year', () => {
      expect(formatPeriodLabel('quarterly', 2, 2025)).toBe('Q2 2025')
    })
  })
})
