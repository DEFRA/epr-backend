import Joi from 'joi'

const BOUND_PATTERN = /^(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/

const FIRST_MONTH = 1
const LAST_MONTH = 12
const FIRST_DAY = 1

const MONTH_START = 0
const MONTH_END = 2
const DAY_START = 3
const DAY_END = 5

/**
 * The last real day of `month` (1-indexed), for the current year - relies on
 * `new Date`'s day-0-of-next-month rollback rather than a hardcoded
 * days-per-month table, so leap years resolve correctly without a table
 * lookup.
 * @param {number} month - 1-indexed
 * @returns {number}
 */
function maxDayOfMonth(month) {
  return new Date(new Date().getFullYear(), month, 0).getDate()
}

/**
 * @param {string} value
 */
function validateDecemberWasteWindowBound(value) {
  Joi.assert(value, Joi.string().pattern(BOUND_PATTERN))

  // The pattern above already guarantees this fixed-width shape, so the
  // month/day can be sliced directly rather than re-extracted from a second
  // `exec` whose null case Joi.assert has already ruled out.
  const month = Number(value.slice(MONTH_START, MONTH_END))
  const day = Number(value.slice(DAY_START, DAY_END))

  if (
    month < FIRST_MONTH ||
    month > LAST_MONTH ||
    day < FIRST_DAY ||
    day > maxDayOfMonth(month)
  ) {
    throw new Error(
      `decemberWaste.windowStart must name a real date, got "${value}"`
    )
  }
}

export const convictValidateDecemberWasteWindowBound = {
  name: 'december-waste-window-bound',
  validate: validateDecemberWasteWindowBound
}
