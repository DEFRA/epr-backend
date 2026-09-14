import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'
import {
  createPrn,
  issuePrn,
  cancelPrnCreation,
  cancelIssuedPrn,
  acceptPrn,
  rejectPrn,
  PRN_COMMAND_STATUS,
  PRN_COMMAND_REJECTION
} from '#waste-balances/domain/commands.js'
import { PRN_STATUS, transitionRefusal, issuanceRefusal } from './model.js'
import { cancellationRefusal } from './cancellation.js'

/**
 * @import {PrnStatus, PrnActor} from './model.js'
 * @import {LedgerBalanceSnapshot, LedgerEventKind, PrnAcceptedPayload} from '#waste-balances/repository/ledger-schema.js'
 * @import {BalanceEvent, PrnCommandRejection, PrnDecision} from '#waste-balances/domain/commands.js'
 * @import {Accreditation} from '#domain/organisations/accreditation.js'
 */

/**
 * The balance effect each permitted status transition carries: the ledger event
 * kind it appends and the decision that produces it. Transitions absent from
 * this table have no balance effect — the state machine has exactly one,
 * `draft` → `discarded`.
 *
 * The single statement of the relation: the event-kind → status table the
 * read-side fold uses is derived from it below, so the round trip cannot drift.
 * That each row's decision emits the kind beside it is asserted by this
 * module's table test rather than by a runtime guard.
 *
 * @type {ReadonlyArray<{
 *   from: PrnStatus,
 *   to: PrnStatus,
 *   kind: LedgerEventKind,
 *   decide: (balance: LedgerBalanceSnapshot, payload: PrnAcceptedPayload) => PrnDecision
 * }>}
 */
export const PRN_TRANSITION_EFFECTS = Object.freeze([
  {
    from: PRN_STATUS.DRAFT,
    to: PRN_STATUS.AWAITING_AUTHORISATION,
    kind: LEDGER_EVENT_KIND.PRN_CREATED,
    decide: createPrn
  },
  {
    from: PRN_STATUS.AWAITING_AUTHORISATION,
    to: PRN_STATUS.AWAITING_ACCEPTANCE,
    kind: LEDGER_EVENT_KIND.PRN_ISSUED,
    decide: issuePrn
  },
  {
    from: PRN_STATUS.AWAITING_AUTHORISATION,
    to: PRN_STATUS.DELETED,
    kind: LEDGER_EVENT_KIND.PRN_CREATION_CANCELLED,
    decide: cancelPrnCreation
  },
  {
    from: PRN_STATUS.AWAITING_ACCEPTANCE,
    to: PRN_STATUS.ACCEPTED,
    kind: LEDGER_EVENT_KIND.PRN_ACCEPTED,
    decide: acceptPrn
  },
  {
    from: PRN_STATUS.AWAITING_ACCEPTANCE,
    to: PRN_STATUS.AWAITING_CANCELLATION,
    kind: LEDGER_EVENT_KIND.PRN_REJECTED,
    decide: rejectPrn
  },
  {
    from: PRN_STATUS.AWAITING_CANCELLATION,
    to: PRN_STATUS.CANCELLED,
    kind: LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE,
    decide: cancelIssuedPrn
  },
  {
    from: PRN_STATUS.ACCEPTED,
    to: PRN_STATUS.CANCELLED,
    kind: LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE,
    decide: cancelIssuedPrn
  },
  {
    from: PRN_STATUS.AWAITING_ACCEPTANCE,
    to: PRN_STATUS.CANCELLED,
    kind: LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE,
    decide: cancelIssuedPrn
  }
])

/**
 * Ledger-event-kind → PRN currentStatus, derived from the transition table: an
 * event projects to the target of the transition that appends it. Kinds
 * appended by more than one transition (`prn-cancelled-after-issue`) share a
 * target, which the table test asserts.
 *
 * @type {Record<string, PrnStatus>}
 */
export const LEDGER_EVENT_KIND_TO_PRN_STATUS = Object.freeze(
  Object.fromEntries(PRN_TRANSITION_EFFECTS.map(({ to, kind }) => [kind, to]))
)

/**
 * Whether a PRN at this status has been issued, read off the transition table:
 * the status the issuance transition leads to. Reaching it appends
 * `prn-issued`, so an empty ledger under it is corruption, not client error.
 *
 * @param {PrnStatus} status
 */
const hasBeenIssued = (status) =>
  PRN_TRANSITION_EFFECTS.some(
    (effect) =>
      effect.kind === LEDGER_EVENT_KIND.PRN_ISSUED && effect.to === status
  )

/**
 * A transition out of an issued PRN found no ledger to decide against. Every
 * route to that status appends an event, so the ledger cannot legitimately be
 * empty: this is a broken invariant, not something the client did wrong.
 */
export const LEDGER_MISSING_AFTER_ISSUE = 'ledger-missing-after-issue'

/**
 * Why a transition cannot proceed against the ledger state it was ruled
 * against: one of the deciders' own rejections, or this module's ruling that
 * the ledger is missing under a PRN that must have one.
 *
 * @typedef {PrnCommandRejection | typeof LEDGER_MISSING_AFTER_ISSUE} PrnLedgerRejection
 */

/**
 * A transition refused on the ledger state rather than on the state machine.
 * Carries the reason as data; the application shapes it into the response its
 * callers expect, where the ledger identity is in hand.
 */
export class PrnLedgerRejectionError extends Error {
  /**
   * @param {PrnLedgerRejection} reason
   * @param {PrnStatus} fromStatus
   * @param {PrnStatus} newStatus
   */
  constructor(reason, fromStatus, newStatus) {
    super(`${fromStatus} -> ${newStatus} refused by the ledger: ${reason}`)
    this.reason = reason
    this.fromStatus = fromStatus
    this.newStatus = newStatus
  }
}

/**
 * Who a directly-stated status change is recorded against. Narrower than the
 * PRN's own `Actor`, whose name is best-view enrichment: a write always knows
 * the user making it, and the PRN repository requires a name to stamp.
 *
 * @typedef {{ id: string, name: string }} StatusChangeActor
 */

/**
 * What a transition does to the PRN, or why it cannot be made.
 *
 * `balanceEvents` are appended and folded onto the PRN, so the document is
 * derived from them. `statusChange` is stated directly, for the one transition
 * that appends nothing. Both are named by the domain, so the application never
 * infers which it was handed.
 *
 * @typedef {{ balanceEvents: BalanceEvent[] }
 *   | { statusChange: { to: PrnStatus, at: Date, by: StatusChangeActor } }
 *   | { error: Error }} PrnTransitionOutcome
 */

/**
 * The three rules a PRN transition must satisfy, composed. Each returns the
 * refusal it found or `undefined`, so the first refusal short-circuits the rest
 * and the caller gets one answer as data. Every refusal is one of the classes
 * the routes already map, so the application throws exactly what it was handed.
 *
 * @param {Object} params
 * @param {PrnStatus} params.fromStatus
 * @param {PrnStatus} params.newStatus
 * @param {PrnActor} params.actor
 * @param {Accreditation} [params.accreditation]
 * @param {number} params.accreditationYear
 * @param {Date} params.now
 * @returns {Error | undefined}
 */
const ruleTransition = ({
  fromStatus,
  newStatus,
  actor,
  accreditation,
  accreditationYear,
  now
}) =>
  transitionRefusal(fromStatus, newStatus, actor) ??
  cancellationRefusal(fromStatus, newStatus, accreditationYear, now) ??
  issuanceRefusal(newStatus, accreditation)

/**
 * Phase 2 of a PRN status write — decide. Rule on the transition and say what
 * it does.
 *
 * Pure: every input is a parameter, `now` and the folded ledger balance
 * included, and nothing is read or written. It is the only place the three
 * transition rules compose and the only place a transition's balance effect is
 * looked up, so an application that routed on the target status ahead of the
 * ruling would be answering a domain question for itself.
 *
 * A `null` balance means the ledger holds no events; whether that is the
 * client's problem depends on where the PRN has got to, which is why the ruling
 * is made here rather than at the ledger.
 *
 * @param {Object} params
 * @param {PrnStatus} params.fromStatus - the status ruled on, taken from the projection
 * @param {PrnStatus} params.newStatus
 * @param {PrnActor} params.actor
 * @param {Accreditation} [params.accreditation] - required only for issuance
 * @param {number} params.accreditationYear
 * @param {Date} params.now
 * @param {LedgerBalanceSnapshot | null} params.balance - `null` for a ledger with no events
 * @param {PrnAcceptedPayload} params.payload
 * @param {StatusChangeActor} params.updatedBy - stamped on a directly-stated status change
 * @returns {PrnTransitionOutcome}
 */
export function decidePrnTransition({
  fromStatus,
  newStatus,
  actor,
  accreditation,
  accreditationYear,
  now,
  balance,
  payload,
  updatedBy
}) {
  const refusal = ruleTransition({
    fromStatus,
    newStatus,
    actor,
    accreditation,
    accreditationYear,
    now
  })
  if (refusal) {
    return { error: refusal }
  }

  const effect = PRN_TRANSITION_EFFECTS.find(
    (candidate) => candidate.from === fromStatus && candidate.to === newStatus
  )
  if (!effect) {
    return { statusChange: { to: newStatus, at: now, by: updatedBy } }
  }

  if (!balance) {
    return {
      error: new PrnLedgerRejectionError(
        hasBeenIssued(fromStatus)
          ? LEDGER_MISSING_AFTER_ISSUE
          : PRN_COMMAND_REJECTION.NO_LEDGER,
        fromStatus,
        newStatus
      )
    }
  }

  const decision = effect.decide(balance, payload)
  return decision.status === PRN_COMMAND_STATUS.REJECTED
    ? {
        error: new PrnLedgerRejectionError(
          decision.reason,
          fromStatus,
          newStatus
        )
      }
    : { balanceEvents: decision.events }
}
