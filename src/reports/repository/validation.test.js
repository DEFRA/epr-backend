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

  it('rejects a full ISO datetime startDate instead of silently coercing it', () => {
    const params = buildCreateReportParams({
      startDate: '2024-01-01T00:00:00.000Z'
    })

    expect(() => validateCreateReport(params)).toThrow(
      /must be a bare YYYY-MM-DD date/
    )
  })

  it('rejects a full ISO datetime endDate instead of silently coercing it', () => {
    const params = buildCreateReportParams({
      endDate: '2024-01-31T00:00:00.000Z'
    })

    expect(() => validateCreateReport(params)).toThrow(
      /must be a bare YYYY-MM-DD date/
    )
  })

  it('rejects a full ISO datetime dueDate instead of silently coercing it', () => {
    const params = buildCreateReportParams({
      dueDate: '2024-02-15T00:00:00.000Z'
    })

    expect(() => validateCreateReport(params)).toThrow(
      /must be a bare YYYY-MM-DD date/
    )
  })
})
