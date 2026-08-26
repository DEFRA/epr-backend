import Boom from '@hapi/boom'

import { LedgerSlotConflictError } from '#waste-balances/repository/ledger-port.js'
import { PRN_VERSION_CONFLICT } from '#packaging-recycling-notes/repository/port.js'

/**
 * A write that decided correctly and was beaten to one of the two things it
 * had to claim: the ledger slot it folded at, or the version of the document
 * it read.
 *
 * @param {*} error
 */
const lostTheRace = (error) =>
  error instanceof LedgerSlotConflictError ||
  error?.data?.kind === PRN_VERSION_CONFLICT

/**
 * The refusal for a request that decided correctly and lost a race, or
 * `undefined` for any other failure.
 *
 * Nothing is wrong with the request or the server: the state moved under it,
 * so this is a conflict rather than a fault, and repeating it will report the
 * settled state.
 *
 * Both errors describe themselves to an engineer reading the logs, in ledger
 * identities and document versions, so the response carries a plain message
 * instead.
 *
 * @param {*} error
 * @returns {Error | undefined}
 */
export const lostRaceRefusal = (error) =>
  lostTheRace(error)
    ? Boom.conflict(
        'This PRN was updated by another request. Please try again.'
      )
    : undefined
