/**
 * The submitting operator as a ledger event records them.
 *
 * @param {import('#domain/summary-logs/worker/port.js').SubmitUser} user
 * @returns {import('../repository/ledger-schema.js').LedgerUserSummary}
 */
export const toLedgerUser = ({ id, name, email }) => ({
  id,
  ...(name && { name }),
  email
})
