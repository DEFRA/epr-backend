import {
  LEDGER_TRANSACTION_TYPE,
  LEDGER_SOURCE_KIND,
  LEDGER_PRN_OPERATION_TYPE
} from './ledger-schema.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

const DEFAULT_CREATED_AT = new Date('2026-01-15T10:00:00.000Z')

const buildSummaryLogRowSource = (overrides = {}) => ({
  summaryLogId: 'log-1',
  rowId: 'row-1',
  rowType: WASTE_RECORD_TYPE.RECEIVED,
  wasteRecordId: 'waste-record-1',
  wasteRecordVersionId: 'version-1',
  ...overrides
})

const buildPrnOperationSource = (overrides = {}) => ({
  prnId: 'prn-1',
  operationType: LEDGER_PRN_OPERATION_TYPE.CREATION,
  ...overrides
})

const buildManualAdjustmentSource = (overrides = {}) => ({
  userId: 'user-1',
  reason: 'Corrective adjustment',
  ...overrides
})

/**
 * Build a valid ledger transaction (insert shape — no `id`).
 * @param {object} [overrides]
 */
export const buildLedgerTransaction = (overrides = {}) => ({
  accreditationId: 'acc-1',
  organisationId: 'org-1',
  registrationId: 'reg-1',
  number: 1,
  type: LEDGER_TRANSACTION_TYPE.CREDIT,
  createdAt: DEFAULT_CREATED_AT,
  createdBy: { id: 'user-1', name: 'Test User' },
  amount: 10,
  opening: { amount: 0, availableAmount: 0 },
  closing: { amount: 10, availableAmount: 10 },
  source: {
    kind: LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
    summaryLogRow: buildSummaryLogRowSource()
  },
  ...overrides
})

export const buildPrnOperationLedgerTransaction = (overrides = {}) =>
  buildLedgerTransaction({
    type: LEDGER_TRANSACTION_TYPE.PENDING_DEBIT,
    amount: -5,
    opening: { amount: 10, availableAmount: 10 },
    closing: { amount: 10, availableAmount: 5 },
    source: {
      kind: LEDGER_SOURCE_KIND.PRN_OPERATION,
      prnOperation: buildPrnOperationSource()
    },
    ...overrides
  })

export const buildManualAdjustmentLedgerTransaction = (overrides = {}) =>
  buildLedgerTransaction({
    type: LEDGER_TRANSACTION_TYPE.DEBIT,
    amount: -2,
    opening: { amount: 10, availableAmount: 10 },
    closing: { amount: 8, availableAmount: 8 },
    source: {
      kind: LEDGER_SOURCE_KIND.MANUAL_ADJUSTMENT,
      manualAdjustment: buildManualAdjustmentSource()
    },
    ...overrides
  })
