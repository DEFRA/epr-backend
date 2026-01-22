import { describe, expect, it } from 'vitest'
import { formatDate } from './date-formatter.js'

describe('formatDate', () => {
  it('should format date in DD/MM/YYYY format', () => {
    const date = new Date('2026-11-22T00:00:00Z')
    expect(formatDate(date)).toBe('22/11/2026')
  })

  it('should format dates with single digit days and months correctly', () => {
    const date = new Date('2026-03-05T00:00:00Z')
    expect(formatDate(date)).toBe('05/03/2026')
  })
})
