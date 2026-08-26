import { describe, it, expect } from 'vitest'

import {
  decidePrnTransition,
  LEDGER_EVENT_KIND_TO_PRN_STATUS,
  LEDGER_MISSING_AFTER_ISSUE,
  PRN_TRANSITION_EFFECTS,
  PrnLedgerRejectionError
} from './prn-transition.js'
import {
  AccreditationStatusError,
  PRN_ACTOR,
  PRN_STATUS,
  PRN_STATUS_TRANSITIONS,
  StatusConflictError,
  UnauthorisedTransitionError
} from './model.js'
import { RelevantYearWindowExpiredError } from './relevant-year.js'
import { PRN_COMMAND_REJECTION } from '#waste-balances/domain/commands.js'
import { ACCREDITATION_STATUS } from '#domain/organisations/model.js'
import { buildAccreditation } from '#repositories/organisations/contract/test-data.js'

/**
 * @import {PrnStatus, PrnActor} from './model.js'
 * @import {LedgerBalanceSnapshot} from '#waste-balances/repository/ledger-schema.js'
 */

const ACCREDITATION_YEAR = 2026
const NOW = new Date('2026-06-01T00:00:00.000Z')
const UPDATED_BY = { id: 'user-1', name: 'A User' }
const PAYLOAD = { prnId: 'prn-1', amount: 10 }

/** A balance large enough that no sufficiency check refuses. */
const AMPLE = { amount: 1000, availableAmount: 1000 }

const approvedAccreditation = () =>
  buildAccreditation({ status: ACCREDITATION_STATUS.APPROVED })

/**
 * An actor the state machine permits for this transition, so a case about a
 * later rule is not refused by the actor check first.
 *
 * @param {PrnStatus} fromStatus
 * @param {PrnStatus} newStatus
 * @returns {PrnActor}
 */
const permittedActor = (fromStatus, newStatus) => {
  const [transition] = PRN_STATUS_TRANSITIONS[fromStatus].filter(
    (candidate) => candidate.status === newStatus
  )
  const [actor] = transition.actors
  return actor
}

/**
 * @param {Object} params
 * @param {PrnStatus} params.fromStatus
 * @param {PrnStatus} params.newStatus
 * @param {PrnActor} [params.actor]
 * @param {LedgerBalanceSnapshot | null} [params.balance]
 * @param {Date} [params.now]
 * @param {import('#domain/organisations/accreditation.js').Accreditation} [params.accreditation]
 */
const decide = ({
  fromStatus,
  newStatus,
  actor = permittedActor(fromStatus, newStatus),
  balance = AMPLE,
  now = NOW,
  accreditation = approvedAccreditation()
}) =>
  decidePrnTransition({
    fromStatus,
    newStatus,
    actor,
    accreditation,
    accreditationYear: ACCREDITATION_YEAR,
    now,
    balance,
    payload: PAYLOAD,
    updatedBy: UPDATED_BY
  })

describe('the transition table', () => {
  it.each(PRN_TRANSITION_EFFECTS.map(({ from, to, kind }) => [from, to, kind]))(
    '%s -> %s appends %s, which projects back to the transition target',
    (fromStatus, newStatus, kind) => {
      const outcome = decide({ fromStatus, newStatus })

      expect(outcome).toMatchObject({ balanceEvents: [{ kind }] })
      expect(LEDGER_EVENT_KIND_TO_PRN_STATUS[kind]).toBe(newStatus)
    }
  )

  it('covers every permitted transition but the one that appends nothing', () => {
    // Walked from the statuses rather than `Object.entries`, which widens the
    // keys to `string` and loses the check that these are real PRN statuses.
    const permitted = Object.values(PRN_STATUS).flatMap((fromStatus) =>
      PRN_STATUS_TRANSITIONS[fromStatus].map((transition) => ({
        from: fromStatus,
        to: transition.status
      }))
    )

    const withoutEffect = permitted.filter(
      ({ from, to }) =>
        !PRN_TRANSITION_EFFECTS.some(
          (effect) => effect.from === from && effect.to === to
        )
    )

    expect(withoutEffect).toEqual([
      { from: PRN_STATUS.DRAFT, to: PRN_STATUS.DISCARDED }
    ])
  })
})

describe('a transition the state machine refuses', () => {
  it('returns a status conflict when no such transition exists', () => {
    const outcome = decide({
      fromStatus: PRN_STATUS.DRAFT,
      newStatus: PRN_STATUS.ACCEPTED,
      actor: PRN_ACTOR.PRODUCER
    })

    expect(outcome).toEqual({ error: expect.any(StatusConflictError) })
  })

  it('returns an unauthorised transition when the actor may not make it', () => {
    const outcome = decide({
      fromStatus: PRN_STATUS.DRAFT,
      newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
      actor: PRN_ACTOR.PRODUCER
    })

    expect(outcome).toEqual({ error: expect.any(UnauthorisedTransitionError) })
  })

  it('returns the relevant-year refusal when the cancellation window has closed', () => {
    const outcome = decide({
      fromStatus: PRN_STATUS.ACCEPTED,
      newStatus: PRN_STATUS.CANCELLED,
      now: new Date('2027-02-01T00:00:00.000Z')
    })

    expect(outcome).toEqual({
      error: expect.any(RelevantYearWindowExpiredError)
    })
  })

  it.each([ACCREDITATION_STATUS.SUSPENDED, ACCREDITATION_STATUS.CANCELLED])(
    'returns the accreditation refusal when issuing on a %s accreditation',
    (status) => {
      const outcome = decide({
        fromStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        accreditation: buildAccreditation({ status })
      })

      expect(outcome).toEqual({ error: expect.any(AccreditationStatusError) })
    }
  )
})

describe('a transition that appends nothing', () => {
  it('states the status change directly for draft -> discarded', () => {
    const outcome = decide({
      fromStatus: PRN_STATUS.DRAFT,
      newStatus: PRN_STATUS.DISCARDED
    })

    expect(outcome).toEqual({
      statusChange: {
        to: PRN_STATUS.DISCARDED,
        at: NOW,
        by: UPDATED_BY
      }
    })
  })

  it('rules on the transition before stating it', () => {
    const outcome = decide({
      fromStatus: PRN_STATUS.AWAITING_AUTHORISATION,
      newStatus: PRN_STATUS.DISCARDED,
      actor: PRN_ACTOR.REPROCESSOR_EXPORTER
    })

    expect(outcome).toEqual({ error: expect.any(StatusConflictError) })
  })
})

describe('a ledger with no events', () => {
  it('is the client’s problem for a PRN that has never been created', () => {
    const outcome = decide({
      fromStatus: PRN_STATUS.DRAFT,
      newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
      balance: null
    })

    expect(outcome).toEqual({
      error: expect.objectContaining({
        reason: PRN_COMMAND_REJECTION.NO_LEDGER
      })
    })
    expect(outcome).toEqual({
      error: expect.any(PrnLedgerRejectionError)
    })
  })

  it.each([PRN_STATUS.ACCEPTED, PRN_STATUS.AWAITING_CANCELLATION])(
    'is corruption for a transition into %s, which only an issued PRN can make',
    (newStatus) => {
      const outcome = decide({
        fromStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        newStatus,
        balance: null
      })

      expect(outcome).toEqual({
        error: expect.objectContaining({ reason: LEDGER_MISSING_AFTER_ISSUE })
      })
    }
  )
})

describe('a ledger that cannot carry the transition', () => {
  it('reports an exhausted available balance on creation', () => {
    const outcome = decide({
      fromStatus: PRN_STATUS.DRAFT,
      newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
      balance: { amount: 500, availableAmount: 0 }
    })

    expect(outcome).toEqual({
      error: expect.objectContaining({
        reason: PRN_COMMAND_REJECTION.INSUFFICIENT_AVAILABLE_BALANCE
      })
    })
  })

  it('reports an exhausted total balance on issuance', () => {
    const outcome = decide({
      fromStatus: PRN_STATUS.AWAITING_AUTHORISATION,
      newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      balance: { amount: 0, availableAmount: 500 }
    })

    expect(outcome).toEqual({
      error: expect.objectContaining({
        reason: PRN_COMMAND_REJECTION.INSUFFICIENT_TOTAL_BALANCE
      })
    })
  })

  it('names the transition it refused', () => {
    const outcome = decide({
      fromStatus: PRN_STATUS.DRAFT,
      newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
      balance: null
    })

    expect(outcome).toEqual({
      error: expect.objectContaining({
        fromStatus: PRN_STATUS.DRAFT,
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        message: expect.stringContaining(
          `${PRN_STATUS.DRAFT} -> ${PRN_STATUS.AWAITING_AUTHORISATION}`
        )
      })
    })
  })
})
