import { add, toNumber } from '#common/helpers/decimal-utils.js'
import { getTargetAmount } from './target-amount.js'
import { prnTransitionToStreamKind } from './compute-rebuilt-stream.js'

import { STREAM_EVENT_KIND } from '../repository/stream-schema.js'

/**
 * @typedef {import('#domain/waste-records/model.js').WasteRecord} WasteRecord
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} PackagingRecyclingNote
 * @typedef {import('#domain/organisations/accreditation.js').Accreditation} Accreditation
 * @typedef {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} OverseasSitesContext
 */

const PRN_DELTAS = Object.freeze({
  [STREAM_EVENT_KIND.PRN_CREATED]: (tonnage) => ({
    amount: 0,
    availableAmount: -tonnage
  }),
  [STREAM_EVENT_KIND.PRN_ISSUED]: (tonnage) => ({
    amount: -tonnage,
    availableAmount: 0
  }),
  [STREAM_EVENT_KIND.PRN_CREATION_CANCELLED]: (tonnage) => ({
    amount: 0,
    availableAmount: tonnage
  }),
  [STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE]: (tonnage) => ({
    amount: tonnage,
    availableAmount: tonnage
  }),
  [STREAM_EVENT_KIND.PRN_ACCEPTED]: () => ({ amount: 0, availableAmount: 0 }),
  [STREAM_EVENT_KIND.PRN_REJECTED]: () => ({ amount: 0, availableAmount: 0 })
})

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
    const kind = prnTransitionToStreamKind(prevStatus, history[i].status)
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
