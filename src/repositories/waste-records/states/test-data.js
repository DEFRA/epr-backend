import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

/**
 * Build a waste record state document (insert shape — no `id`).
 * Defaults to an INCLUDED received-waste row in one submission's membership.
 * @param {object} [overrides]
 */
export const buildRowState = (overrides = {}) => ({
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId: 'acc-1',
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  rowId: 'row-1',
  data: { supplierName: 'Acme', tonnage: 10 },
  classification: {
    outcome: ROW_OUTCOME.INCLUDED,
    reasons: [],
    transactionAmount: 10
  },
  summaryLogIds: ['log-1'],
  ...overrides
})

/**
 * Build a per-row entry as produced by the 1.1 classification list — the
 * shape `upsertRowStates` consumes (no partition fields, no membership).
 * @param {object} [overrides]
 */
export const buildRowStateEntry = (overrides = {}) => ({
  rowId: 'row-1',
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  data: { supplierName: 'Acme', tonnage: 10 },
  classification: {
    outcome: ROW_OUTCOME.INCLUDED,
    reasons: [],
    transactionAmount: 10
  },
  ...overrides
})

export const DEFAULT_PARTITION = Object.freeze({
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId: 'acc-1'
})
