import { describe, expect, it } from 'vitest'
import { toYear } from '#common/helpers/dates/year.js'
import {
  DEFAULT_TEMPLATE_YEAR,
  templateYear,
  templateYearOf
} from './template-year.js'

describe('templateYear', () => {
  it('reads the 2027 template version 2027.01 as 2027', () => {
    expect(templateYear(2027.01)).toBe(2027)
  })

  it.each([
    [5, 'accredited'],
    [2.1, 'registered-only']
  ])(
    'reads %s, the 2026 %s template version, as the default year',
    (version) => {
      expect(templateYear(version)).toBe(DEFAULT_TEMPLATE_YEAR)
    }
  )

  it('defaults to 2026', () => {
    expect(DEFAULT_TEMPLATE_YEAR).toBe(2026)
  })
})

describe('templateYearOf', () => {
  it.each([
    [2025, 2026],
    [2026, 2026],
    [2027, 2027]
  ])('reads %s rows on the %s templates', (year, expected) => {
    expect(templateYearOf(toYear(year))).toBe(expected)
  })
})
