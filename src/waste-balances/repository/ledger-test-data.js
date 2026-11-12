import { toSummaryLogFileId } from '#domain/summary-logs/ids.js'
import { withNumbers } from '#waste-records/repository/test-data.js'

import { LEDGER_EVENT_KIND } from './ledger-schema.js'

const DEFAULT_CREATED_AT = new Date('2026-01-15T10:00:00.000Z')

/**
 * @typedef {Partial<import('./ledger-schema.js').RegistrationOrAccreditationId & { year: import('#common/helpers/dates/year.js').Year }>} LedgerIdOverrides
 */

/**
 * Build a waste balance ledger's ids and numbers. Defaults match
 * `buildLedgerEvent`, so a ledger id built with no overrides names the ledger
 * that event belongs to.
 *
 * @param {LedgerIdOverrides} [overrides]
 * @returns {import('./ledger-schema.js').RegistrationOrAccreditationId & import('./ledger-schema.js').WasteBalanceLedgerId}
 */
export const buildLedgerId = (overrides = {}) =>
  withNumbers({
    organisationId: 'org-1',
    registrationId: 'reg-1',
    accreditationId: 'acc-1',
    ...overrides
  })

/**
 * The numbers alone of the ledger `buildLedgerId` builds from the same
 * overrides.
 *
 * @param {LedgerIdOverrides} [overrides]
 * @returns {import('#domain/organisations/numbers.js').RequiredNumbers}
 */
export const buildLedgerNumbers = (overrides = {}) => {
  const { organisationNumber, registrationNumber, accreditationNumber } =
    buildLedgerId(overrides)
  return { organisationNumber, registrationNumber, accreditationNumber }
}

/**
 * Build a valid ledger event (insert shape — no `id`).
 * Defaults to a summary-log-submitted event, with the numbers of whichever
 * ledger the overrides name. An event stores numbers alone, so ids in the
 * overrides only choose the numbers.
 * @param {object} [overrides]
 */
export const buildLedgerEvent = (overrides = {}) => {
  const {
    organisationId: _organisationId,
    registrationId: _registrationId,
    accreditationId: _accreditationId,
    ...event
  } = {
    ...withNumbers({
      registrationId: 'reg-1',
      accreditationId: 'acc-1',
      organisationId: 'org-1',
      ...overrides
    }),
    number: 1,
    kind: LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
    payload: {
      summaryLogId: toSummaryLogFileId('log-1'),
      creditTotal: 100
    },
    openingBalance: { amount: 0, availableAmount: 0 },
    closingBalance: { amount: 100, availableAmount: 100 },
    createdAt: DEFAULT_CREATED_AT,
    createdBy: { id: 'user-1', name: 'Test User' },
    ...overrides
  }
  return event
}

/**
 * Build a PRN-created event.
 * @param {object} [overrides]
 */
export const buildPrnCreatedEvent = (overrides = {}) =>
  buildLedgerEvent({
    kind: LEDGER_EVENT_KIND.PRN_CREATED,
    payload: { prnId: 'prn-1', amount: 50 },
    openingBalance: { amount: 100, availableAmount: 100 },
    closingBalance: { amount: 100, availableAmount: 50 },
    ...overrides
  })

/**
 * Build a PRN-issued event.
 * @param {object} [overrides]
 */
export const buildPrnIssuedEvent = (overrides = {}) =>
  buildLedgerEvent({
    kind: LEDGER_EVENT_KIND.PRN_ISSUED,
    payload: { prnId: 'prn-1', amount: 50 },
    openingBalance: { amount: 100, availableAmount: 50 },
    closingBalance: { amount: 50, availableAmount: 50 },
    ...overrides
  })

/**
 * Build a PRN-creation-cancelled event.
 * @param {object} [overrides]
 */
export const buildPrnCreationCancelledEvent = (overrides = {}) =>
  buildLedgerEvent({
    kind: LEDGER_EVENT_KIND.PRN_CREATION_CANCELLED,
    payload: { prnId: 'prn-1', amount: 50 },
    openingBalance: { amount: 100, availableAmount: 50 },
    closingBalance: { amount: 100, availableAmount: 100 },
    ...overrides
  })

/**
 * Build a PRN-cancelled-after-issue event.
 * @param {object} [overrides]
 */
export const buildPrnCancelledAfterIssueEvent = (overrides = {}) =>
  buildLedgerEvent({
    kind: LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE,
    payload: { prnId: 'prn-1', amount: 50 },
    openingBalance: { amount: 50, availableAmount: 50 },
    closingBalance: { amount: 100, availableAmount: 100 },
    ...overrides
  })

/**
 * Build a PRN-accepted event. The kind alone signals no balance delta;
 * payload carries the PRN's tonnage for downstream consumers.
 * @param {object} [overrides]
 */
export const buildPrnAcceptedEvent = (overrides = {}) =>
  buildLedgerEvent({
    kind: LEDGER_EVENT_KIND.PRN_ACCEPTED,
    payload: { prnId: 'prn-1', amount: 50 },
    openingBalance: { amount: 100, availableAmount: 50 },
    closingBalance: { amount: 100, availableAmount: 50 },
    ...overrides
  })

/**
 * Build a PRN-rejected event. The kind alone signals no balance delta;
 * payload carries the PRN's tonnage for downstream consumers.
 * @param {object} [overrides]
 */
export const buildPrnRejectedEvent = (overrides = {}) =>
  buildLedgerEvent({
    kind: LEDGER_EVENT_KIND.PRN_REJECTED,
    payload: { prnId: 'prn-1', amount: 50 },
    openingBalance: { amount: 100, availableAmount: 50 },
    closingBalance: { amount: 100, availableAmount: 50 },
    ...overrides
  })
