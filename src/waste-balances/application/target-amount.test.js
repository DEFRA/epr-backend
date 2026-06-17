import { describe, it, expect, vi, beforeEach } from 'vitest'

import { classifyWasteRecord, getTargetAmount } from './target-amount.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

vi.mock('#domain/summary-logs/table-schemas/index.js', () => ({
  findSchemaForProcessingType: vi.fn()
}))

const accreditation = { id: 'acc-1' }
const overseasSites = /** @type {*} */ (new Map())

const buildRecord = (overrides = {}) =>
  /** @type {*} */ ({
    rowId: 'row-1',
    type: 'EXPORTED',
    data: { processingType: PROCESSING_TYPES.EXPORTER, tonnage: 100 },
    excludedFromWasteBalance: false,
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

  it('classifies an excluded-from-waste-balance record as EXCLUDED with no amount', async () => {
    const record = buildRecord({ excludedFromWasteBalance: true })

    const { classification } = classifyWasteRecord(
      record,
      accreditation,
      overseasSites
    )

    expect(classification).toEqual({
      outcome: ROW_OUTCOME.EXCLUDED,
      reasons: [],
      transactionAmount: 0
    })
  })

  it('classifies a record with no matching schema as EXCLUDED with no amount', async () => {
    await setSchema(null)
    const record = buildRecord()

    const { classification } = classifyWasteRecord(
      record,
      accreditation,
      overseasSites
    )

    expect(classification).toEqual({
      outcome: ROW_OUTCOME.EXCLUDED,
      reasons: [],
      transactionAmount: 0
    })
  })

  it('surfaces the included outcome, reasons and amount from the schema classifier', async () => {
    await setSchema({
      classifyForWasteBalance: () => ({
        outcome: ROW_OUTCOME.INCLUDED,
        reasons: [{ code: 'WITHIN_ACCREDITATION_PERIOD' }],
        transactionAmount: 100
      })
    })
    const record = buildRecord()

    const { classification } = classifyWasteRecord(
      record,
      accreditation,
      overseasSites
    )

    expect(classification).toEqual({
      outcome: ROW_OUTCOME.INCLUDED,
      reasons: [{ code: 'WITHIN_ACCREDITATION_PERIOD' }],
      transactionAmount: 100
    })
  })

  it('surfaces an excluded classifier outcome and reasons, contributing no amount', async () => {
    await setSchema({
      classifyForWasteBalance: () => ({
        outcome: ROW_OUTCOME.IGNORED,
        reasons: [{ code: 'PRN_ISSUED' }]
      })
    })
    const record = buildRecord()

    const { classification } = classifyWasteRecord(
      record,
      accreditation,
      overseasSites
    )

    expect(classification).toEqual({
      outcome: ROW_OUTCOME.IGNORED,
      reasons: [{ code: 'PRN_ISSUED' }],
      transactionAmount: 0
    })
  })
})

describe('getTargetAmount', () => {
  it('returns the transaction amount for an included classification', () => {
    expect(
      getTargetAmount({
        outcome: ROW_OUTCOME.INCLUDED,
        reasons: [],
        transactionAmount: 75
      })
    ).toBe(75)
  })

  it('returns zero for a non-included classification', () => {
    expect(
      getTargetAmount({
        outcome: ROW_OUTCOME.EXCLUDED,
        reasons: [],
        transactionAmount: 0
      })
    ).toBe(0)
  })
})
