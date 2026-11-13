import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATE_YEAR, templateYear } from './template-year.js'

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
