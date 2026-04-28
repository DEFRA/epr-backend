/**
 * Read primitives for the waste balance ledger.
 *
 * Each function resolves through a single port call. Higher-level operations
 * compose them — see ADR 0031 and the read-side acceptance criteria for the
 * read primitives bead (Defra-v4xtg.9).
 */

/**
 * @typedef {import('../repository/ledger-port.js').LedgerRepository} LedgerRepository
 */

/**
 * @typedef {import('../repository/ledger-schema.js').LedgerBalanceSnapshot} LedgerBalanceSnapshot
 */

/**
 * @typedef {Object} AccreditationBalance
 * @property {string} accreditationId
 * @property {number} amount
 * @property {number} availableAmount
 */

const ZERO_BALANCE = Object.freeze({ amount: 0, availableAmount: 0 })

/**
 * Current balance for an accreditation: the closing balance of its
 * highest-numbered transaction. Returns zeros if no transactions exist.
 *
 * @param {LedgerRepository} repository
 * @param {string} accreditationId
 * @returns {Promise<LedgerBalanceSnapshot>}
 */
export const getCurrentBalance = async (repository, accreditationId) => {
  const latest = await repository.findLatestByAccreditationId(accreditationId)
  return latest ? latest.closingBalance : { ...ZERO_BALANCE }
}

/**
 * Signed sum of every ledger transaction touching the waste record (credits
 * positive, debits negative). Returns 0 if the waste record has no
 * transactions. Single-id convenience wrapper around the bulk primitive.
 *
 * @param {LedgerRepository} repository
 * @param {string} wasteRecordId
 * @returns {Promise<number>}
 */
export const getCreditedAmountByWasteRecordId = async (
  repository,
  wasteRecordId
) => {
  const credited = await repository.findCreditedAmountsByWasteRecordIds([
    wasteRecordId
  ])
  return credited.get(wasteRecordId) ?? 0
}

/**
 * @param {Array<import('../repository/ledger-schema.js').LedgerTransaction>} transactions
 * @returns {AccreditationBalance[]}
 */
const toAccreditationBalances = (transactions) =>
  transactions.map((transaction) => ({
    accreditationId: transaction.accreditationId,
    amount: transaction.closingBalance.amount,
    availableAmount: transaction.closingBalance.availableAmount
  }))

/**
 * Latest balance for every accreditation under the organisation.
 *
 * @param {LedgerRepository} repository
 * @param {string} organisationId
 * @returns {Promise<AccreditationBalance[]>}
 */
export const getOrganisationBalances = async (repository, organisationId) => {
  const latest =
    await repository.findLatestPerAccreditationByOrganisationId(organisationId)
  return toAccreditationBalances(latest)
}

/**
 * Latest balance for every accreditation under the registration.
 *
 * @param {LedgerRepository} repository
 * @param {string} registrationId
 * @returns {Promise<AccreditationBalance[]>}
 */
export const getRegistrationBalances = async (repository, registrationId) => {
  const latest =
    await repository.findLatestPerAccreditationByRegistrationId(registrationId)
  return toAccreditationBalances(latest)
}
