import { describe, expect, it, vi } from 'vitest'
import { buildTransactionAmounts } from './transaction-amounts.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { SUMMARY_LOG_ID, buildWasteRecord } from './test-builders.js'

/** @import {WasteRecord} from '#domain/waste-records/model.js' */
/** @import {TableSchema} from '#domain/summary-logs/table-schemas/index.js' */

describe('buildTransactionAmounts', () => {
  /** @type {import('./transaction-amounts.js').ClassificationContext} */
  const stubContext = {
    accreditation: null,
    overseasSites: ORS_VALIDATION_DISABLED
  }

  /** @param {number} amount */
  const stubSchema = (amount) =>
    /** @type {TableSchema} */ (
      /** @type {unknown} */ ({
        classifyForWasteBalance: () => ({
          outcome: ROW_OUTCOME.INCLUDED,
          reasons: [],
          transactionAmount: amount
        })
      })
    )

  const stubSchemaExcluded = () =>
    /** @type {TableSchema} */ (
      /** @type {unknown} */ ({
        classifyForWasteBalance: () => ({
          outcome: ROW_OUTCOME.EXCLUDED,
          reasons: [{ code: 'MISSING_REQUIRED_FIELD' }]
        })
      })
    )

  it('forwards classification context to classifyForWasteBalance', () => {
    const wasteBalanceRecords = [
      buildWasteRecord({ rowId: '1000', change: 'CREATED' })
    ]

    const classifyForWasteBalance = vi.fn().mockReturnValue({
      outcome: ROW_OUTCOME.INCLUDED,
      reasons: [],
      transactionAmount: 10
    })

    /** @type {import('./transaction-amounts.js').ClassificationContext} */
    const context = {
      accreditation:
        /** @type {import('#domain/organisations/accreditation.js').Accreditation} */ (
          /** @type {unknown} */ ({ status: 'approved' })
        ),
      overseasSites: ORS_VALIDATION_DISABLED
    }

    buildTransactionAmounts({
      wasteBalanceRecords,
      summaryLogId: SUMMARY_LOG_ID,
      existingRecordsMap: new Map(),
      findSchema: () =>
        /** @type {TableSchema} */ (
          /** @type {unknown} */ ({ classifyForWasteBalance })
        ),
      context
    })

    expect(classifyForWasteBalance).toHaveBeenCalledWith(
      expect.any(Object),
      context
    )
  })

  it('returns the full transaction amount for added records', () => {
    const wasteBalanceRecords = [
      buildWasteRecord({ rowId: '1000', change: 'CREATED' })
    ]

    const result = buildTransactionAmounts({
      wasteBalanceRecords,
      summaryLogId: SUMMARY_LOG_ID,
      existingRecordsMap: new Map(),
      findSchema: () => stubSchema(10),
      context: stubContext
    })

    expect(result.get('received:1000')).toEqual({ oldAmount: 0, newAmount: 10 })
  })

  it('returns old and new amounts for adjusted records', () => {
    const wasteBalanceRecords = [
      buildWasteRecord({
        rowId: '1000',
        change: 'UPDATED',
        data: { NET_WEIGHT: '15' }
      })
    ]

    const existingRecord = /** @type {WasteRecord} */ (
      /** @type {unknown} */ ({
        type: 'received',
        rowId: '1000',
        data: { NET_WEIGHT: '10' }
      })
    )

    /** Schema stub that reads NET_WEIGHT from data */
    const dataSensitiveSchema = /** @type {TableSchema} */ (
      /** @type {unknown} */ ({
        classifyForWasteBalance: (/** @type {Record<string, any>} */ data) => ({
          outcome: ROW_OUTCOME.INCLUDED,
          reasons: [],
          transactionAmount: Number(data.NET_WEIGHT)
        })
      })
    )

    const result = buildTransactionAmounts({
      wasteBalanceRecords,
      summaryLogId: SUMMARY_LOG_ID,
      existingRecordsMap: new Map([['received:1000', existingRecord]]),
      findSchema: () => dataSensitiveSchema,
      context: stubContext
    })

    expect(result.get('received:1000')).toEqual({
      oldAmount: 10,
      newAmount: 15
    })
  })

  it('skips records where classification returns zero', () => {
    const wasteBalanceRecords = [
      buildWasteRecord({ rowId: '1000', change: 'CREATED' })
    ]

    const result = buildTransactionAmounts({
      wasteBalanceRecords,
      summaryLogId: SUMMARY_LOG_ID,
      existingRecordsMap: new Map(),
      findSchema: () => stubSchema(0),
      context: stubContext
    })

    expect(result.size).toBe(0)
  })

  it('skips adjusted records where both old and new amounts are zero', () => {
    const wasteBalanceRecords = [
      buildWasteRecord({ rowId: '1000', change: 'UPDATED' })
    ]

    const result = buildTransactionAmounts({
      wasteBalanceRecords,
      summaryLogId: SUMMARY_LOG_ID,
      existingRecordsMap: new Map(),
      findSchema: () => stubSchema(0),
      context: stubContext
    })

    expect(result.size).toBe(0)
  })

  it('returns null when findSchema returns null', () => {
    const wasteBalanceRecords = [
      buildWasteRecord({ rowId: '1000', change: 'CREATED' })
    ]

    const result = buildTransactionAmounts({
      wasteBalanceRecords,
      summaryLogId: SUMMARY_LOG_ID,
      existingRecordsMap: new Map(),
      findSchema: () => null,
      context: stubContext
    })

    expect(result.size).toBe(0)
  })

  it('skips records that are not INCLUDED by classification', () => {
    const wasteBalanceRecords = [
      buildWasteRecord({ rowId: '1000', change: 'CREATED' })
    ]

    const result = buildTransactionAmounts({
      wasteBalanceRecords,
      summaryLogId: SUMMARY_LOG_ID,
      existingRecordsMap: new Map(),
      findSchema: () => stubSchemaExcluded(),
      context: stubContext
    })

    expect(result.size).toBe(0)
  })

  it('skips added excluded records (no prior contribution to reverse)', () => {
    const wasteBalanceRecords = [
      buildWasteRecord({
        rowId: '1000',
        change: 'CREATED',
        outcome: ROW_OUTCOME.EXCLUDED
      })
    ]

    const result = buildTransactionAmounts({
      wasteBalanceRecords,
      summaryLogId: SUMMARY_LOG_ID,
      existingRecordsMap: new Map(),
      findSchema: () => stubSchema(10),
      context: stubContext
    })

    expect(result.size).toBe(0)
  })

  it('returns negative delta when an adjusted record becomes excluded', () => {
    // Record was previously included at 10 tonnes, now excluded.
    // Delta should be 0 (new, excluded) - 10 (old, included) = -10.
    const wasteBalanceRecords = [
      buildWasteRecord({
        rowId: '1000',
        change: 'UPDATED',
        outcome: ROW_OUTCOME.EXCLUDED,
        data: { NET_WEIGHT: '' }
      })
    ]

    const existingRecord = /** @type {WasteRecord} */ (
      /** @type {unknown} */ ({
        type: 'received',
        rowId: '1000',
        data: { NET_WEIGHT: '10' }
      })
    )

    const dataSensitiveSchema = /** @type {TableSchema} */ (
      /** @type {unknown} */ ({
        classifyForWasteBalance: (/** @type {Record<string, any>} */ data) => {
          const weight = Number(data.NET_WEIGHT)
          if (!weight) {
            return { outcome: ROW_OUTCOME.EXCLUDED, reasons: [] }
          }
          return {
            outcome: ROW_OUTCOME.INCLUDED,
            reasons: [],
            transactionAmount: weight
          }
        }
      })
    )

    const result = buildTransactionAmounts({
      wasteBalanceRecords,
      summaryLogId: SUMMARY_LOG_ID,
      existingRecordsMap: new Map([['received:1000', existingRecord]]),
      findSchema: () => dataSensitiveSchema,
      context: stubContext
    })

    expect(result.get('received:1000')).toEqual({ oldAmount: 10, newAmount: 0 })
  })

  it('uses zero as old amount when no existing record found for adjusted record', () => {
    const wasteBalanceRecords = [
      buildWasteRecord({
        rowId: '1000',
        change: 'UPDATED',
        data: { NET_WEIGHT: '15' }
      })
    ]

    const dataSensitiveSchema = /** @type {TableSchema} */ (
      /** @type {unknown} */ ({
        classifyForWasteBalance: (/** @type {Record<string, any>} */ data) => ({
          outcome: ROW_OUTCOME.INCLUDED,
          reasons: [],
          transactionAmount: Number(data.NET_WEIGHT)
        })
      })
    )

    const result = buildTransactionAmounts({
      wasteBalanceRecords,
      summaryLogId: SUMMARY_LOG_ID,
      existingRecordsMap: new Map(),
      findSchema: () => dataSensitiveSchema,
      context: stubContext
    })

    expect(result.get('received:1000')).toEqual({ oldAmount: 0, newAmount: 15 })
  })
})
