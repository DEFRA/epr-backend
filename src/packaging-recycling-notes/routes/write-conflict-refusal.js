import Boom from '@hapi/boom'

import { LedgerSlotConflictError } from '#waste-balances/repository/ledger-port.js'
import { PRN_VERSION_CONFLICT } from '#packaging-recycling-notes/repository/port.js'

/**
 * A conflict on either of the two concurrency surfaces a PRN write claims: the
 * unique index on ledger event slots, and the version on the PRN document
 * (ADR-0036, "Concurrency").
 *
 * @param {*} error
 */
const isWriteConflict = (error) =>
  error instanceof LedgerSlotConflictError ||
  error?.data?.kind === PRN_VERSION_CONFLICT

/**
 * The refusal a write conflict earns, or `undefined` for any other failure.
 *
 * A repository detects a conflict and surfaces it rather than absorbing it,
 * which leaves the response to its caller (ADR-0036, "Concurrency"). This is
 * that response: nothing is wrong with the request or the server, the state
 * moved under it, and repeating the request will report the settled state.
 *
 * Both errors describe themselves to an engineer reading the logs, in ledger
 * identities and document versions, so the response carries a plain message
 * instead.
 *
 * @param {*} error
 * @returns {Error | undefined}
 */
export const writeConflictRefusal = (error) =>
  isWriteConflict(error)
    ? Boom.conflict(
        'This PRN was updated by another request. Please try again.'
      )
    : undefined
