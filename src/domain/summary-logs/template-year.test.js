import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATE_YEAR, templateYear } from './template-year.js'

describe('templateYear', () => {
  it.each([
    [2027.01, 2027],
    [2027.05, 2027],
    [2026.01, 2026],
    [2025.01, 2025],
    [2027, 2027],
    [1000, 1000],
    [9999.99, 9999]
  ])('reads %s as the year %s', (version, year) => {
    expect(templateYear(version)).toBe(year)
  })

  it.each([5, 2.1, 999.99, 10000, 0])(
    'reads %s, which has no year, as the default year',
    (version) => {
      expect(templateYear(version)).toBe(DEFAULT_TEMPLATE_YEAR)
    }
  )

  it('defaults to 2026', () => {
    expect(DEFAULT_TEMPLATE_YEAR).toBe(2026)
  })
})
