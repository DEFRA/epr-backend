import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { utcYearOf } from '#common/helpers/dates/year.js'
import { generateOrgId } from '#repositories/form-submissions/contract/test-data.js'

/** @import { WasteBalanceLedgerId } from '#waste-balances/repository/ledger-schema.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */

/**
 * Build a summary-log row state document (insert shape — no `id`).
 * Defaults to an INCLUDED received-waste row in one submission's membership.
 * @param {object} [overrides]
 */
export const buildSummaryLogRowState = (overrides = {}) => ({
  ...DEFAULT_LEDGER_ID,
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

export const DEFAULT_YEAR = utcYearOf('2026-01-01')

/**
 * A random organisation number, so test files sharing a database don't
 * collide.
 *
 * @returns {OrganisationNumber}
 */
export const anotherOrganisationNumber = () =>
  toOrganisationNumber(String(generateOrgId()))

/** @type {Readonly<WasteBalanceLedgerId>} */
export const DEFAULT_LEDGER_ID = Object.freeze({
  organisationNumber: anotherOrganisationNumber(),
  registrationNumber: toRegistrationNumber('REG-reg-1'),
  accreditationNumber: toAccreditationNumber('ACC-acc-1'),
  year: DEFAULT_YEAR
})
