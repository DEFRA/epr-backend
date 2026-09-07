import { contributionFor } from '#waste-balances/domain/credited-tonnage.js'
import { monthKeyForDate } from '#common/helpers/dates/year-month.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

/**
 * @typedef {import('#waste-balances/domain/credited-tonnage.js').CreditableWasteRecordState} CreditableWasteRecordState
 * @typedef {import('#domain/summary-logs/meta-fields.js').ProcessingType} ProcessingType
 * @typedef {import('#domain/organisations/accreditation.js').Accreditation} Accreditation
 */

const DECEMBER = '12'
const YEAR_LENGTH = 4

/**
 * The `YYYY-12` month key of the accreditation year — the December that
 * accreditation's tonnage accrues against — taken from the year of `validFrom`.
 * Null when `validFrom` is absent or too short to carry a year, so a caller
 * that cannot place a December counts nothing rather than guessing one.
 *
 * @param {Pick<Accreditation, 'validFrom'>} accreditation
 * @returns {string | null}
 */
export const accreditationDecemberKey = ({ validFrom }) => {
  if (typeof validFrom !== 'string' || validFrom.length < YEAR_LENGTH) {
    return null
  }
  return `${validFrom.slice(0, YEAR_LENGTH)}-${DECEMBER}`
}

/**
 * How many of an accreditation's row states would affect its December waste
 * portion — in either direction. A row counts when it contributes to the
 * balance under the accreditation's processing type (`contributionFor` is
 * non-null: exporter exported loads, reprocessor-input received and sent-on
 * loads) and its balance-affecting date falls in the accreditation-year
 * December. Reprocessor-output never accrues a December portion, so it counts
 * nothing regardless of its rows' dates.
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
