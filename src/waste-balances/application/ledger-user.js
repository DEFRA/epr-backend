/** @import { SubmitUser } from '#domain/summary-logs/worker/port.js' */
/** @import { LedgerUserSummary } from '#waste-balances/repository/ledger-schema.js' */

/**
 * The submitting operator as a ledger event records them.
 *
 * @param {SubmitUser} user
 * @returns {LedgerUserSummary}
 */
export const toLedgerUser = ({ id, name, email }) => ({
  id,
  ...(name && { name }),
  email
})
