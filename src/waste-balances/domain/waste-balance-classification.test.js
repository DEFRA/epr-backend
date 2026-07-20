import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  WASTE_BALANCE_OUTCOME,
  classifyRecordForWasteBalance
} from './waste-balance-classification.js'
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
    data: { tonnage: 100 },
    ...overrides
  })

const setSchema = async (schema) => {
  const { findSchemaForProcessingType } =
    await import('#domain/summary-logs/table-schemas/index.js')
  vi.mocked(findSchemaForProcessingType).mockReturnValue(
    /** @type {*} */ (schema)
  )
}

describe('WASTE_BALANCE_OUTCOME', () => {
  it('keeps INCLUDED, EXCLUDED and IGNORED string-identical to the shared validation outcomes', () => {
    expect(WASTE_BALANCE_OUTCOME.INCLUDED).toBe(ROW_OUTCOME.INCLUDED)
    expect(WASTE_BALANCE_OUTCOME.EXCLUDED).toBe(ROW_OUTCOME.EXCLUDED)
    expect(WASTE_BALANCE_OUTCOME.IGNORED).toBe(ROW_OUTCOME.IGNORED)
  })

  it('adds a NOT_APPLICABLE outcome absent from the shared validation outcomes', () => {
    expect(WASTE_BALANCE_OUTCOME.NOT_APPLICABLE).toBe('NOT_APPLICABLE')
    expect(Object.values(ROW_OUTCOME)).not.toContain(
      WASTE_BALANCE_OUTCOME.NOT_APPLICABLE
    )
  })
})

describe('classifyRecordForWasteBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is NOT_APPLICABLE when there is no accreditation', async () => {
    await setSchema({
      classifyForWasteBalance: () => ({
        outcome: ROW_OUTCOME.INCLUDED,
        reasons: [],
        transactionAmount: 100
      })
    })

    expect(
      classifyRecordForWasteBalance(
        buildRecord(),
        PROCESSING_TYPES.EXPORTER,
        null,
        overseasSites
      )
    ).toEqual({
      outcome: WASTE_BALANCE_OUTCOME.NOT_APPLICABLE,
      reasons: [],
      transactionAmount: 0
    })
  })

  it('selects the table schema from the processing type it is given, not from the row data', async () => {
    await setSchema({
      classifyForWasteBalance: () => ({
        outcome: ROW_OUTCOME.INCLUDED,
        reasons: [],
        transactionAmount: 100
      })
    })
    const { findSchemaForProcessingType } =
      await import('#domain/summary-logs/table-schemas/index.js')

    classifyRecordForWasteBalance(
      buildRecord({
        data: { processingType: PROCESSING_TYPES.REPROCESSOR_INPUT }
      }),
      PROCESSING_TYPES.EXPORTER,
      accreditation,
      overseasSites
    )

    expect(findSchemaForProcessingType).toHaveBeenCalledWith(
      PROCESSING_TYPES.EXPORTER,
      'EXPORTED'
    )
  })

  it('is NOT_APPLICABLE when the schema has no waste-balance classifier', async () => {
    await setSchema(null)

    expect(
      classifyRecordForWasteBalance(
        buildRecord(),
        PROCESSING_TYPES.EXPORTER,
        accreditation,
        overseasSites
      )
    ).toEqual({
      outcome: WASTE_BALANCE_OUTCOME.NOT_APPLICABLE,
      reasons: [],
      transactionAmount: 0
    })
  })

  it('surfaces the excluded outcome and reasons from the schema classifier, contributing no amount', async () => {
    await setSchema({
      classifyForWasteBalance: () => ({
        outcome: ROW_OUTCOME.EXCLUDED,
        reasons: [{ code: 'MISSING_REQUIRED_FIELD', field: 'tonnage' }]
      })
    })

    expect(
      classifyRecordForWasteBalance(
        buildRecord(),
        PROCESSING_TYPES.EXPORTER,
        accreditation,
        overseasSites
      )
    ).toEqual({
      outcome: WASTE_BALANCE_OUTCOME.EXCLUDED,
      reasons: [{ code: 'MISSING_REQUIRED_FIELD', field: 'tonnage' }],
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

    expect(
      classifyRecordForWasteBalance(
        buildRecord(),
        PROCESSING_TYPES.EXPORTER,
        accreditation,
        overseasSites
      )
    ).toEqual({
      outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
      reasons: [{ code: 'WITHIN_ACCREDITATION_PERIOD' }],
      transactionAmount: 100
    })
  })

  it('surfaces an ignored classifier outcome and reasons, contributing no amount', async () => {
    await setSchema({
      classifyForWasteBalance: () => ({
        outcome: ROW_OUTCOME.IGNORED,
        reasons: [{ code: 'PRN_ISSUED' }]
      })
    })

    expect(
      classifyRecordForWasteBalance(
        buildRecord(),
        PROCESSING_TYPES.EXPORTER,
        accreditation,
        overseasSites
      )
    ).toEqual({
      outcome: WASTE_BALANCE_OUTCOME.IGNORED,
      reasons: [{ code: 'PRN_ISSUED' }],
      transactionAmount: 0
    })
  })
})
