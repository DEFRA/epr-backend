import { add, toNumber } from '#common/helpers/decimal-utils.js'
import { monthKeyForDate } from '#common/helpers/dates/year-month.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { contributionFor } from '#waste-balances/domain/credited-tonnage.js'

import { getTargetAmount } from './target-amount.js'

/**
 * The signed tonnage that accrues to the December portion of a summary-log
 * submission: the sum, over the classified rows, of each row's signed target
 * amount whose balance-affecting date falls in December of the accreditation
 * year.
 *
 * It reuses the same per-row date-field mapping (`contributionFor`) and signed
 * target amount (`getTargetAmount`) as the general `creditTotal`, so the
 * December portion stays consistent with the total by construction: excluded
 * rows contribute zero, sent-on rows deduct, and a resubmission's delta
 * self-corrects. The row's granular processing type is read from its own data,
 * exactly as classification reads it.
 *
 * INVARIANT: reprocessor-output never accrues a December portion. Its per-row
 * date is load-left-site, not received-for-recycling (ADR-0049), so output rows
 * are excluded outright before their date is read.
 *
 * @param {import('./target-amount.js').ClassifiedRow[]} classifiedRows
 * @param {import('#domain/organisations/accreditation.js').Accreditation} accreditation
 * @returns {number}
 */
export const decemberCreditTotalFor = (classifiedRows, accreditation) => {
  // Accreditation windows are calendar-year aligned, so the year the
  // accreditation starts is the year of its spendable December: the December
  // key is that year's `-12`. An accreditation with no validFrom yields no
  // December key and so accrues nothing.
  const decemberKey = `${accreditation.validFrom?.slice(0, 4)}-12`

  let total = 0
  for (const row of classifiedRows) {
    const processingType = row.data.processingType
    if (processingType === PROCESSING_TYPES.REPROCESSOR_OUTPUT) {
      continue
    }

    const contribution = contributionFor(row, processingType)
    if (contribution === null) {
      continue
    }

    if (monthKeyForDate(row.data[contribution.dateField]) !== decemberKey) {
      continue
    }

    total = toNumber(add(total, getTargetAmount(row.classification)))
  }

  return total
}
