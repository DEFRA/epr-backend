import { describe, it, expect } from 'vitest'

import { classifyWasteRecord, getTargetAmount } from './target-amount.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { tableSchemasWith } from '#waste-balances/domain/table-schemas-test-helpers.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

const accreditation =
  /** @type {import('#domain/organisations/accreditation.js').Accreditation} */ (
    /** @type {unknown} */ ({ id: 'acc-1' })
  )
const overseasSites = /** @type {*} */ (new Map())

const buildRecord = (overrides = {}) =>
  /** @type {*} */ ({
    rowId: 'row-1',
    type: WASTE_RECORD_TYPE.EXPORTED,
    data: { processingType: PROCESSING_TYPES.EXPORTER, tonnage: 100 },
    ...overrides
  })

describe('classifyWasteRecord', () => {
  it('carries the row identity and data alongside the classification', () => {
    const tableSchemas = tableSchemasWith(() => ({
      outcome: ROW_OUTCOME.INCLUDED,
      reasons: [],
      transactionAmount: 42
    }))
    const record = buildRecord({
      rowId: 'row-7',
      type: WASTE_RECORD_TYPE.EXPORTED,
      data: { processingType: PROCESSING_TYPES.EXPORTER, tonnage: 42 }
    })

    const result = classifyWasteRecord(
      record,
      tableSchemas,
      accreditation,
      overseasSites
    )

    expect(result.rowId).toBe('row-7')
    expect(result.wasteRecordType).toBe(WASTE_RECORD_TYPE.EXPORTED)
    expect(result.data).toEqual({
      processingType: PROCESSING_TYPES.EXPORTER,
      tonnage: 42
    })
  })

  it('delegates classification to the waste-balance classifier', () => {
    const tableSchemas = tableSchemasWith(() => ({
      outcome: ROW_OUTCOME.INCLUDED,
      reasons: [{ code: 'WITHIN_ACCREDITATION_PERIOD' }],
      transactionAmount: 100
    }))

    const { classification } = classifyWasteRecord(
      buildRecord(),
      tableSchemas,
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
