import { describe, it, expect, vi, beforeEach } from 'vitest'

import { classifyWasteRecord, getTargetAmount } from './target-amount.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

vi.mock('#domain/summary-logs/table-schemas/index.js', () => ({
  findSchemaForProcessingType: vi.fn()
}))

const accreditation =
  /** @type {import('#domain/organisations/accreditation.js').Accreditation} */ (
    /** @type {unknown} */ ({ id: 'acc-1' })
  )
const overseasSites = /** @type {*} */ (new Map())

const buildRecord = (overrides = {}) =>
  /** @type {*} */ ({
    rowId: 'row-1',
    type: 'EXPORTED',
    data: { processingType: PROCESSING_TYPES.EXPORTER, tonnage: 100 },
    ...overrides
  })

const setSchema = async (schema) => {
  const { findSchemaForProcessingType } =
    await import('#domain/summary-logs/table-schemas/index.js')
  vi.mocked(findSchemaForProcessingType).mockReturnValue(
    /** @type {*} */ (schema)
  )
}

describe('classifyWasteRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('carries the row identity and data alongside the classification', async () => {
    await setSchema({
      classifyForWasteBalance: () => ({
        outcome: ROW_OUTCOME.INCLUDED,
        reasons: [],
        transactionAmount: 42
      })
    })
    const record = buildRecord({
      rowId: 'row-7',
      type: 'EXPORTED',
      data: { processingType: PROCESSING_TYPES.EXPORTER, tonnage: 42 }
    })

    const result = classifyWasteRecord(record, accreditation, overseasSites)

    expect(result.rowId).toBe('row-7')
    expect(result.wasteRecordType).toBe('EXPORTED')
    expect(result.data).toEqual({
      processingType: PROCESSING_TYPES.EXPORTER,
      tonnage: 42
    })
  })

  it('delegates classification to the waste-balance classifier', async () => {
    await setSchema({
      classifyForWasteBalance: () => ({
        outcome: ROW_OUTCOME.INCLUDED,
        reasons: [{ code: 'WITHIN_ACCREDITATION_PERIOD' }],
        transactionAmount: 100
      })
    })

    const { classification } = classifyWasteRecord(
      buildRecord(),
      accreditation,
      overseasSites
    )

    expect(classification).toEqual({
      outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
      reasons: [{ code: 'WITHIN_ACCREDITATION_PERIOD' }],
      transactionAmount: 100
    })
  })
})

describe('getTargetAmount', () => {
  it('returns the transaction amount for an included classification', () => {
    expect(
      getTargetAmount({
        outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
        reasons: [],
        transactionAmount: 75
      })
    ).toBe(75)
  })

  it('returns zero for a non-included classification', () => {
    expect(
      getTargetAmount({
        outcome: WASTE_BALANCE_OUTCOME.NOT_APPLICABLE,
        reasons: [],
        transactionAmount: 0
      })
    ).toBe(0)
  })
})
