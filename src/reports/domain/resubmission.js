/**
 * Reason discriminator on a submitted report's `resubmissionRequired` flag.
 * Mirrors the shape of `STALE_REASON` in `#reports/domain/stale.js` but is a
 * distinct field with distinct semantics: `stale` blocks an action on active
 * drafts, whereas `resubmissionRequired` invites a new submission on an
 * already-submitted report (ADR-0039).
 */
export const RESUBMISSION_REASON = Object.freeze({
  CLOSED_PERIOD_RESTATED: 'closed_period_restated'
})

/** @typedef {(typeof RESUBMISSION_REASON)[keyof typeof RESUBMISSION_REASON]} ResubmissionReason */
