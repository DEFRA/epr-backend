import { STREAM_EVENT_KIND } from './stream-schema.js'

const DEFAULT_CREATED_AT = new Date('2026-01-15T10:00:00.000Z')

/**
 * Build a valid stream event (insert shape — no `id`).
 * Defaults to a summary-log-submitted event.
 * @param {object} [overrides]
 */
export const buildStreamEvent = (overrides = {}) => ({
  registrationId: 'reg-1',
  accreditationId: 'acc-1',
  organisationId: 'org-1',
  number: 1,
  kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
  payload: {
    summaryLogId: 'log-1',
    creditTotal: 100
  },
  openingBalance: { amount: 0, availableAmount: 0 },
  closingBalance: { amount: 100, availableAmount: 100 },
  createdAt: DEFAULT_CREATED_AT,
  createdBy: { id: 'user-1', name: 'Test User' },
  ...overrides
})

/**
 * Build a PRN-created event.
 * @param {object} [overrides]
 */
export const buildPrnCreatedEvent = (overrides = {}) =>
  buildStreamEvent({
    kind: STREAM_EVENT_KIND.PRN_CREATED,
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
  buildStreamEvent({
    kind: STREAM_EVENT_KIND.PRN_ISSUED,
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
  buildStreamEvent({
    kind: STREAM_EVENT_KIND.PRN_CREATION_CANCELLED,
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
  buildStreamEvent({
    kind: STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE,
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
  buildStreamEvent({
    kind: STREAM_EVENT_KIND.PRN_ACCEPTED,
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
  buildStreamEvent({
    kind: STREAM_EVENT_KIND.PRN_REJECTED,
    payload: { prnId: 'prn-1', amount: 50 },
    openingBalance: { amount: 100, availableAmount: 50 },
    closingBalance: { amount: 100, availableAmount: 50 },
    ...overrides
  })
