import { describe, it, expect } from 'vitest'

import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'

import { summaryLogRowStateInsertSchema } from './schema.js'
import {
  validateSummaryLogRowStateInsert,
  validateSummaryLogRowStateRead
} from './validation.js'
import { buildSummaryLogRowState } from './test-data.js'
import { expectValidationError } from '#common/validation/validation-test-helpers.js'

const validate = (data) =>
  summaryLogRowStateInsertSchema.validate(data, { abortEarly: false })

describe('row state insert schema', () => {
  it('accepts a valid INCLUDED row state', () => {
    const { error } = validate(buildSummaryLogRowState())
    expect(error).toBeUndefined()
  })

  it('accepts an EXCLUDED row state carrying a reason', () => {
    const { error } = validate(
      buildSummaryLogRowState({
        classification: {
          outcome: ROW_OUTCOME.EXCLUDED,
          reasons: [{ code: 'MISSING_REQUIRED_FIELD', field: 'tonnage' }],
          transactionAmount: 0
        }
      })
    )
    expect(error).toBeUndefined()
  })

  it('accepts a NOT_APPLICABLE row state carrying no reasons', () => {
    const { error } = validate(
      buildSummaryLogRowState({
        classification: {
          outcome: WASTE_BALANCE_OUTCOME.NOT_APPLICABLE,
          reasons: [],
          transactionAmount: 0
        }
      })
    )
    expect(error).toBeUndefined()
  })

  it('accepts accreditationId: null for registered-only streams', () => {
    const { error } = validate(
      buildSummaryLogRowState({ accreditationId: null })
    )
    expect(error).toBeUndefined()
  })

  it('preserves arbitrary coerced data keys', () => {
    const data = { supplierName: 'Acme', tonnage: 10, wasteCode: '12 34 56' }
    const { value } = validate(buildSummaryLogRowState({ data }))
    expect(value.data).toEqual(data)
  })

  it('rejects an unknown outcome', () => {
    const { error } = validate(
      buildSummaryLogRowState({
        classification: { outcome: 'WAT', reasons: [], transactionAmount: 0 }
      })
    )
    expect(error).toBeDefined()
  })

  it('rejects an unknown waste record type', () => {
    const { error } = validate(
      buildSummaryLogRowState({ wasteRecordType: 'nonsense' })
    )
    expect(error).toBeDefined()
  })

  it('rejects an unknown classification reason code', () => {
    const { error } = validate(
      buildSummaryLogRowState({
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
    const { error } = validate(buildSummaryLogRowState({ summaryLogIds: [] }))
    expect(error).toBeDefined()
  })

  it('rejects missing required top-level fields', () => {
    const details = expectValidationError(
      summaryLogRowStateInsertSchema,
      {},
      {
        abortEarly: false
      }
    )
    const missing = details.map((d) => d.path[0])
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
  describe('validateSummaryLogRowStateInsert', () => {
    it('returns the validated document for valid input', () => {
      const doc = buildSummaryLogRowState()
      const result = validateSummaryLogRowStateInsert(doc)
      expect(result.rowId).toBe(doc.rowId)
    })

    it('throws Boom.badData for invalid input', () => {
      expect(() => validateSummaryLogRowStateInsert({})).toThrow(
        /Invalid row state data/
      )
    })
  })

  describe('validateSummaryLogRowStateRead', () => {
    it('returns the validated document for valid input with id', () => {
      const doc = { id: 'state-1', ...buildSummaryLogRowState() }
      const result = validateSummaryLogRowStateRead(doc)
      expect(result.id).toBe('state-1')
    })

    it('throws Boom.badImplementation for invalid input', () => {
      expect(() => validateSummaryLogRowStateRead({ id: 'bad' })).toThrow(
        /Invalid row state/
      )
    })
  })
})
