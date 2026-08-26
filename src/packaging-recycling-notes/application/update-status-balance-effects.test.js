import { describe, it, expect, vi } from 'vitest'

import {
  logWasteBalanceUpdate,
  LOG_OPERATION_BY_EVENT_KIND,
  toTransitionError
} from './update-status-balance-effects.js'
import {
  LEDGER_MISSING_AFTER_ISSUE,
  PrnLedgerRejectionError,
  PRN_TRANSITION_EFFECTS
} from '#packaging-recycling-notes/domain/prn-transition.js'
import {
  PRN_STATUS,
  StatusConflictError
} from '#packaging-recycling-notes/domain/model.js'
import { PRN_COMMAND_REJECTION } from '#waste-balances/domain/commands.js'

const ACCREDITATION_ID = 'acc-1'
const PRN_ID = 'prn-1'

/**
 * @param {import('#packaging-recycling-notes/domain/prn-transition.js').PrnLedgerRejection} reason
 */
const refusal = (reason) =>
  new PrnLedgerRejectionError(
    reason,
    PRN_STATUS.AWAITING_ACCEPTANCE,
    PRN_STATUS.ACCEPTED
  )

describe('LOG_OPERATION_BY_EVENT_KIND', () => {
  it('labels every event kind a transition can append', () => {
    const unlabelled = PRN_TRANSITION_EFFECTS.filter(
      ({ kind }) => !LOG_OPERATION_BY_EVENT_KIND[kind]
    )

    expect(unlabelled).toEqual([])
  })
})

describe('logWasteBalanceUpdate', () => {
  it('records the operation, the PRN and the tonnage against the transition', () => {
    const logger = /** @type {import('#common/hapi-types.js').TypedLogger} */ (
      /** @type {unknown} */ ({ info: vi.fn() })
    )

    logWasteBalanceUpdate(
      logger,
      'deduct_available',
      PRN_ID,
      10,
      PRN_STATUS.DRAFT,
      PRN_STATUS.AWAITING_AUTHORISATION
    )

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: `Waste balance deduct_available for PRN ${PRN_ID} (${PRN_STATUS.DRAFT} -> ${PRN_STATUS.AWAITING_AUTHORISATION}), tonnage 10`,
        event: expect.objectContaining({
          action: 'waste_balance_updated',
          category: 'database',
          reference: PRN_ID
        })
      })
    )
  })
})

describe('toTransitionError', () => {
  it('names the accreditation on a 400 when the ledger has no events', () => {
    expect(
      toTransitionError(
        refusal(PRN_COMMAND_REJECTION.NO_LEDGER),
        ACCREDITATION_ID
      )
    ).toMatchObject({
      isBoom: true,
      output: { statusCode: 400 },
      message: `No waste balance found for accreditation: ${ACCREDITATION_ID}`
    })
  })

  it.each([
    [PRN_COMMAND_REJECTION.INSUFFICIENT_AVAILABLE_BALANCE, 'available'],
    [PRN_COMMAND_REJECTION.INSUFFICIENT_TOTAL_BALANCE, 'total']
  ])('raises a 409 for an exhausted %s balance', (reason, balance) => {
    expect(toTransitionError(refusal(reason), ACCREDITATION_ID)).toMatchObject({
      isBoom: true,
      output: { statusCode: 409 },
      message: `Insufficient ${balance} waste balance`
    })
  })

  it('raises a 500 naming the transition when an issued PRN has no ledger', () => {
    expect(
      toTransitionError(refusal(LEDGER_MISSING_AFTER_ISSUE), ACCREDITATION_ID)
    ).toMatchObject({
      isBoom: true,
      output: { statusCode: 500 },
      message: expect.stringContaining(
        `${PRN_STATUS.AWAITING_ACCEPTANCE} -> ${PRN_STATUS.ACCEPTED}`
      )
    })
  })

  it('passes a transition-rule error through untouched, so the routes still map it', () => {
    const error = new StatusConflictError(PRN_STATUS.DRAFT, PRN_STATUS.ACCEPTED)

    expect(toTransitionError(error, ACCREDITATION_ID)).toBe(error)
  })
})
