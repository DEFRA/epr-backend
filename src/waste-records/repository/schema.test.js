import { describe, it, expect } from 'vitest'

import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

import { rowStateInsertSchema } from './schema.js'
import { validateRowStateInsert, validateRowStateRead } from './validation.js'
import { buildRowState } from './test-data.js'

const validate = (data) =>
  rowStateInsertSchema.validate(data, { abortEarly: false })

describe('row state insert schema', () => {
  it('accepts a valid INCLUDED row state', () => {
    const { error } = validate(buildRowState())
    expect(error).toBeUndefined()
  })

  it('accepts an EXCLUDED row state carrying a reason', () => {
    const { error } = validate(
      buildRowState({
        classification: {
          outcome: ROW_OUTCOME.EXCLUDED,
          reasons: [{ code: 'MISSING_REQUIRED_FIELD', field: 'tonnage' }],
          transactionAmount: 0
        }
      })
    )
    expect(error).toBeUndefined()
  })

  it('accepts accreditationId: null for registered-only streams', () => {
    const { error } = validate(buildRowState({ accreditationId: null }))
    expect(error).toBeUndefined()
  })

  it('preserves arbitrary coerced data keys', () => {
    const data = { supplierName: 'Acme', tonnage: 10, wasteCode: '12 34 56' }
    const { value } = validate(buildRowState({ data }))
    expect(value.data).toEqual(data)
  })

  it('rejects an unknown outcome', () => {
    const { error } = validate(
      buildRowState({
        classification: { outcome: 'WAT', reasons: [], transactionAmount: 0 }
      })
    )
    expect(error).toBeDefined()
  })

  it('rejects an unknown waste record type', () => {
    const { error } = validate(buildRowState({ wasteRecordType: 'nonsense' }))
    expect(error).toBeDefined()
  })

  it('rejects an unknown classification reason code', () => {
    const { error } = validate(
      buildRowState({
        classification: {
          outcome: ROW_OUTCOME.EXCLUDED,
          reasons: [{ code: 'NOT_A_REAL_REASON' }],
          transactionAmount: 0
        }
      })
    )
    expect(error).toBeDefined()
  })

  it('rejects an empty summaryLogIds membership', () => {
    const { error } = validate(buildRowState({ summaryLogIds: [] }))
    expect(error).toBeDefined()
  })

  it('rejects missing required top-level fields', () => {
    const { error } = validate({})
    expect(error).toBeDefined()
    const missing = error?.details.map((d) => d.path[0])
    expect(missing).toContain('organisationId')
    expect(missing).toContain('registrationId')
    expect(missing).toContain('rowId')
    expect(missing).toContain('wasteRecordType')
    expect(missing).toContain('data')
    expect(missing).toContain('classification')
    expect(missing).toContain('summaryLogIds')
  })
})

describe('row state validation', () => {
  describe('validateRowStateInsert', () => {
    it('returns the validated document for valid input', () => {
      const doc = buildRowState()
      const result = validateRowStateInsert(doc)
      expect(result.rowId).toBe(doc.rowId)
    })

    it('throws Boom.badData for invalid input', () => {
      expect(() => validateRowStateInsert({})).toThrow(/Invalid row state data/)
    })
  })

  describe('validateRowStateRead', () => {
    it('returns the validated document for valid input with id', () => {
      const doc = { id: 'state-1', ...buildRowState() }
      const result = validateRowStateRead(doc)
      expect(result.id).toBe('state-1')
    })

    it('throws Boom.badImplementation for invalid input', () => {
      expect(() => validateRowStateRead({ id: 'bad' })).toThrow(
        /Invalid row state/
      )
    })
  })
})
