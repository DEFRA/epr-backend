import { LEDGER_TRANSACTION_TYPE, LEDGER_SOURCE_KIND } from './ledger-schema.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

const DEFAULT_CREATED_AT = new Date('2026-01-15T10:00:00.000Z')

const buildSummaryLogRowSource = ({ wasteRecord = {}, ...overrides } = {}) => ({
  summaryLogId: 'log-1',
  wasteRecord: {
    type: WASTE_RECORD_TYPE.RECEIVED,
    rowId: 'row-1',
    versionId: 'version-1',
    creditedAmount: 10,
    ...wasteRecord
  },
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
  openingBalance: { amount: 0, availableAmount: 0 },
  closingBalance: { amount: 10, availableAmount: 10 },
  source: {
    kind: LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
    summaryLogRow: buildSummaryLogRowSource()
  },
  ...overrides
})
