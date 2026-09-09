import { contributionFor } from '#waste-balances/domain/credited-tonnage.js'
import {
  decemberKeyForYearOf,
  monthKeyForDate
} from '#common/helpers/dates/year-month.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

/**
 * @typedef {import('#waste-balances/domain/credited-tonnage.js').CreditableWasteRecordState} CreditableWasteRecordState
 * @typedef {import('#domain/summary-logs/meta-fields.js').ProcessingType} ProcessingType
 * @typedef {import('#domain/organisations/accreditation.js').Accreditation} Accreditation
 */

/**
 * The `YYYY-12` month key of the accreditation year — the December that
 * accreditation's tonnage accrues against — taken from the year of `validFrom`.
 * Null when `validFrom` is absent or too short to carry a year, so a caller
 * that cannot place a December counts nothing rather than guessing one.
 *
 * Delegates to the shared `decemberKeyForYearOf` so the diagnostic and the waste
 * balance accrual place "which December" by one definition.
 *
 * @param {Pick<Accreditation, 'validFrom'>} accreditation
 * @returns {string | null}
 */
export const accreditationDecemberKey = ({ validFrom }) =>
  decemberKeyForYearOf(validFrom)

/**
 * How many of an accreditation's row states are December-dated loads that
 * contribute to the balance under its processing type. A row counts when
 * `contributionFor` is non-null (exporter exported loads, reprocessor-input
 * received and sent-on loads) and its balance-affecting date falls in the
 * accreditation-year December. This flags every accreditation holding a
 * December-dated load for review; it is not the December waste portion itself.
 * A December-dated sent-on load counts here yet, per PAE-1920, deducts only from
 * the general balance and never from the December portion. Reprocessor-output
 * never accrues a December portion, so it counts nothing regardless of its
 * rows' dates.
 *
 * This reuses `contributionFor` — the single source of the balance-affecting
 * date per row type — so the diagnostic buckets a December load exactly as the
 * waste balance does.
 *
 * @param {CreditableWasteRecordState[]} rowStates
 * @param {ProcessingType} processingType
 * @param {string | null} decemberKey - `YYYY-12`, or null when undeterminable
 * @returns {number}
 */
export const countDecemberContributingRows = (
  rowStates,
  processingType,
  decemberKey
) => {
  if (
    processingType === PROCESSING_TYPES.REPROCESSOR_OUTPUT ||
    decemberKey === null
  ) {
    return 0
  }

  let count = 0
  for (const rowState of rowStates) {
    const contribution = contributionFor(rowState, processingType)
    if (contribution === null) {
      continue
    }
    if (
      monthKeyForDate(rowState.data[contribution.dateField]) === decemberKey
    ) {
      count += 1
    }
  }
  return count
}
