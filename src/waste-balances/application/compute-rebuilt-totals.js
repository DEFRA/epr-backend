import { add, toNumber } from '#common/helpers/decimal-utils.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { getTargetAmount } from './target-amount.js'

/**
 * @typedef {import('#domain/waste-records/model.js').WasteRecord} WasteRecord
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} PackagingRecyclingNote
 * @typedef {import('#domain/organisations/accreditation.js').Accreditation} Accreditation
 * @typedef {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} OverseasSitesContext
 */

const REBUILT_TRANSACTION_KIND = Object.freeze({
  PRN_CREATED: 'prn-created',
  PRN_ISSUED: 'prn-issued',
  PRN_CANCELLED_PRE_ISSUE: 'prn-cancelled-pre-issue',
  PRN_CANCELLED_POST_ISSUE: 'prn-cancelled-post-issue'
})

const PRN_DELTAS = Object.freeze({
  [REBUILT_TRANSACTION_KIND.PRN_CREATED]: (tonnage) => ({
    amount: 0,
    availableAmount: -tonnage
  }),
  [REBUILT_TRANSACTION_KIND.PRN_ISSUED]: (tonnage) => ({
    amount: -tonnage,
    availableAmount: 0
  }),
  [REBUILT_TRANSACTION_KIND.PRN_CANCELLED_PRE_ISSUE]: (tonnage) => ({
    amount: 0,
    availableAmount: tonnage
  }),
  [REBUILT_TRANSACTION_KIND.PRN_CANCELLED_POST_ISSUE]: (tonnage) => ({
    amount: tonnage,
    availableAmount: tonnage
  })
})

const prnKindFromTransition = (prevStatus, newStatus) => {
  if (newStatus === PRN_STATUS.AWAITING_AUTHORISATION) {
    return REBUILT_TRANSACTION_KIND.PRN_CREATED
  }
  if (
    newStatus === PRN_STATUS.AWAITING_ACCEPTANCE &&
    prevStatus === PRN_STATUS.AWAITING_AUTHORISATION
  ) {
    return REBUILT_TRANSACTION_KIND.PRN_ISSUED
  }
  if (
    (newStatus === PRN_STATUS.CANCELLED || newStatus === PRN_STATUS.DELETED) &&
    prevStatus === PRN_STATUS.AWAITING_AUTHORISATION
  ) {
    return REBUILT_TRANSACTION_KIND.PRN_CANCELLED_PRE_ISSUE
  }
  if (
    newStatus === PRN_STATUS.CANCELLED &&
    prevStatus === PRN_STATUS.AWAITING_CANCELLATION
  ) {
    return REBUILT_TRANSACTION_KIND.PRN_CANCELLED_POST_ISSUE
  }
  return null
}

/**
 * Iterate balance-affecting deltas from a PRN's status history without
 * materialising an array.
 *
 * @param {PackagingRecyclingNote} prn
 */
function* prnDeltasOf(prn) {
  const history = prn.status.history
  for (let i = 0; i < history.length; i++) {
    const prevStatus = i === 0 ? null : history[i - 1].status
    const kind = prnKindFromTransition(prevStatus, history[i].status)
    if (!kind) {
      continue
    }
    yield PRN_DELTAS[kind](prn.tonnage)
  }
}

/**
 * Rebuild a single accreditation's waste-balance totals from authoritative
 * sources — waste records (credit contributions) and PRN status history
 * (debit and cancellation movements). Used by the pre-cutover divergence
 * diagnostic (PAE-1382 / PAE-1441) to compare against stored embedded
 * balances.
 *
 * @param {Object} params
 * @param {Accreditation} params.accreditation
 * @param {WasteRecord[]} params.wasteRecords
 * @param {PackagingRecyclingNote[]} params.prns
 * @param {OverseasSitesContext} params.overseasSites
 * @returns {{
 *   amount: number,
 *   availableAmount: number,
 *   wasteRecordContribution: number,
 *   prnAmountContribution: number,
 *   prnAvailableAmountContribution: number
 * }}
 */
export const computeRebuiltTotals = ({
  accreditation,
  wasteRecords,
  prns,
  overseasSites
}) => {
  let wasteRecordContribution = 0
  let prnAmountContribution = 0
  let prnAvailableAmountContribution = 0

  for (const record of wasteRecords) {
    const tonnage = getTargetAmount(record, accreditation, overseasSites)
    if (tonnage === 0) {
      continue
    }
    wasteRecordContribution = toNumber(add(wasteRecordContribution, tonnage))
  }

  for (const prn of prns) {
    for (const delta of prnDeltasOf(prn)) {
      prnAmountContribution = toNumber(add(prnAmountContribution, delta.amount))
      prnAvailableAmountContribution = toNumber(
        add(prnAvailableAmountContribution, delta.availableAmount)
      )
    }
  }

  return {
    amount: toNumber(add(wasteRecordContribution, prnAmountContribution)),
    availableAmount: toNumber(
      add(wasteRecordContribution, prnAvailableAmountContribution)
    ),
    wasteRecordContribution,
    prnAmountContribution,
    prnAvailableAmountContribution
  }
}
