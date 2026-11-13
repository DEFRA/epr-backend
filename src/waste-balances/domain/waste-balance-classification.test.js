import { describe, it, expect } from 'vitest'

import {
  WASTE_BALANCE_OUTCOME,
  classifyRecordForWasteBalance
} from './waste-balance-classification.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
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
    data: { tonnage: 100 },
    ...overrides
  })

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
  it('is NOT_APPLICABLE when there is no accreditation', () => {
    const tableSchemas = tableSchemasWith(() => ({
      outcome: ROW_OUTCOME.INCLUDED,
      reasons: [],
      transactionAmount: 100
    }))

    expect(
      classifyRecordForWasteBalance(
        buildRecord(),
        tableSchemas,
        null,
        overseasSites
      )
    ).toEqual({
      outcome: WASTE_BALANCE_OUTCOME.NOT_APPLICABLE,
      reasons: [],
      transactionAmount: 0
    })
  })

  it('is NOT_APPLICABLE when the schema has no waste-balance classifier', () => {
    const tableSchemas = tableSchemasWith(null)

    expect(
      classifyRecordForWasteBalance(
        buildRecord(),
        tableSchemas,
        accreditation,
        overseasSites
      )
    ).toEqual({
      outcome: WASTE_BALANCE_OUTCOME.NOT_APPLICABLE,
      reasons: [],
      transactionAmount: 0
    })
  })

  it('surfaces the excluded outcome and reasons from the schema classifier, contributing no amount', () => {
    const tableSchemas = tableSchemasWith(() => ({
      outcome: ROW_OUTCOME.EXCLUDED,
      reasons: [{ code: 'MISSING_REQUIRED_FIELD', field: 'tonnage' }]
    }))

    expect(
      classifyRecordForWasteBalance(
        buildRecord(),
        tableSchemas,
        accreditation,
        overseasSites
      )
    ).toEqual({
      outcome: WASTE_BALANCE_OUTCOME.EXCLUDED,
      reasons: [{ code: 'MISSING_REQUIRED_FIELD', field: 'tonnage' }],
      transactionAmount: 0
    })
  })

  it('surfaces the included outcome, reasons and amount from the schema classifier', () => {
    const tableSchemas = tableSchemasWith(() => ({
      outcome: ROW_OUTCOME.INCLUDED,
      reasons: [{ code: 'WITHIN_ACCREDITATION_PERIOD' }],
      transactionAmount: 100
    }))

    expect(
      classifyRecordForWasteBalance(
        buildRecord(),
        tableSchemas,
        accreditation,
        overseasSites
      )
    ).toEqual({
      outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
      reasons: [{ code: 'WITHIN_ACCREDITATION_PERIOD' }],
      transactionAmount: 100
    })
  })

  it('surfaces an ignored classifier outcome and reasons, contributing no amount', () => {
    const tableSchemas = tableSchemasWith(() => ({
      outcome: ROW_OUTCOME.IGNORED,
      reasons: [{ code: 'PRN_ISSUED' }]
    }))

    expect(
      classifyRecordForWasteBalance(
        buildRecord(),
        tableSchemas,
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
