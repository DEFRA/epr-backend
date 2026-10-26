import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'

/** @import { WasteBalanceLedgerId } from './schema.js' */

/**
 * Build a summary-log row state document (insert shape — no `id`).
 * Defaults to an INCLUDED received-waste row in one submission's membership.
 * @param {object} [overrides]
 */
export const buildSummaryLogRowState = (overrides = {}) => ({
  ...withNumbers({
    organisationId: 'org-1',
    registrationId: 'reg-1',
    accreditationId: 'acc-1',
    ...overrides
  }),
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  rowId: 'row-1',
  processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
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
 * shape `upsertSummaryLogRowStates` consumes (no ledger-identity fields, no membership).
 * @param {object} [overrides]
 */
export const buildSummaryLogRowStateEntry = (overrides = {}) => ({
  rowId: 'row-1',
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
  data: { supplierName: 'Acme', tonnage: 10 },
  classification: {
    outcome: ROW_OUTCOME.INCLUDED,
    reasons: [],
    transactionAmount: 10
  },
  ...overrides
})

export const DEFAULT_LEDGER_ID = Object.freeze({
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId: 'acc-1'
})

/**
 * The ledger identity with the numbers a submission stores beside its ids.
 *
 * @param {WasteBalanceLedgerId} ledgerId
 * @returns {import('./port.js').NumberedLedgerId}
 */
export const withNumbers = (ledgerId) => ({
  ...ledgerId,
  organisationNumber: toOrganisationNumber('500001'),
  registrationNumber: toRegistrationNumber(`REG-${ledgerId.registrationId}`),
  accreditationNumber:
    ledgerId.accreditationId === null
      ? null
      : toAccreditationNumber(`ACC-${ledgerId.accreditationId}`)
})
