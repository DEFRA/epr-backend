import { toYear } from '#common/helpers/dates/year.js'
import { describe, it, expect } from 'vitest'
import { periodKey } from './period-key.js'

describe('periodKey', () => {
  it('builds a year-cadence-period identity string', () => {
    expect(
      periodKey({ year: toYear(2026), cadence: 'monthly', period: 1 })
    ).toBe('2026:monthly:1')
  })
})
