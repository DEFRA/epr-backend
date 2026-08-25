import Boom from '@hapi/boom'

import { LedgerSlotConflictError } from '#waste-balances/repository/ledger-port.js'

/**
 * The refusal for a request that decided correctly and lost a race, or
 * `undefined` for any other failure.
 *
 * A slot conflict means another writer committed to this PRN's ledger between
 * this request's fold and its append. Nothing is wrong with the request or the
 * server: the work it asked for has been done by someone else, so it is a
 * conflict rather than a fault, and repeating it will report the settled state.
 *
 * The error's own message names the ledger's organisation, registration and
 * accreditation, so the response carries a plain one instead.
 *
 * @param {*} error
 * @returns {Error | undefined}
 */
export const lostRaceRefusal = (error) =>
  error instanceof LedgerSlotConflictError
    ? Boom.conflict(
        'This PRN was updated by another request. Please try again.'
      )
    : undefined
