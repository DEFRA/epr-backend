import { describe, expect, it } from 'vitest'
import { buildCreateReportParams } from './contract/test-data.js'
import { validateCreateReport } from './validation.js'

describe('validateCreateReport', () => {
  it('accepts bare YYYY-MM-DD startDate/endDate/dueDate unchanged', () => {
    const params = buildCreateReportParams({
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      dueDate: '2024-02-15'
    })

    const validated = validateCreateReport(params)

    expect(validated.startDate).toBe('2024-01-01')
    expect(validated.endDate).toBe('2024-01-31')
    expect(validated.dueDate).toBe('2024-02-15')
  })

  it.each(['startDate', 'endDate', 'dueDate'])(
    'rejects a full ISO datetime %s instead of silently coercing it',
    (field) => {
      const params = buildCreateReportParams({
        [field]: '2024-01-01T00:00:00.000Z'
      })

      expect(() => validateCreateReport(params)).toThrow(
        /must be a bare YYYY-MM-DD date/
      )
    }
  )

  it.each(['startDate', 'endDate', 'dueDate'])(
    'rejects a %s that matches the pattern but names no real date',
    (field) => {
      const params = buildCreateReportParams({ [field]: '2024-02-30' })

      expect(() => validateCreateReport(params)).toThrow(
        /must be a bare YYYY-MM-DD date/
      )
    }
  )
})
