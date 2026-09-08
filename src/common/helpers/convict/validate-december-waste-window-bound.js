import Joi from 'joi'

const BOUND_PATTERN = /^(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/**
 * @param {number} month - 1-indexed
 * @returns {number}
 */
function maxDayOfMonth(month) {
  return DAYS_IN_MONTH[month - 1]
}

/**
 * @param {string} value
 */
function validateDecemberWasteWindowBound(value) {
  Joi.assert(value, Joi.string().pattern(BOUND_PATTERN))

  // The pattern above already guarantees this fixed-width shape, so the
  // month/day can be sliced directly rather than re-extracted from a second
  // `exec` whose null case Joi.assert has already ruled out.
  const month = Number(value.slice(0, 2))
  const day = Number(value.slice(3, 5))

  if (month < 1 || month > 12 || day < 1 || day > maxDayOfMonth(month)) {
    throw new Error(
      `decemberWaste.windowStart must name a real date, got "${value}"`
    )
  }
}

export const convictValidateDecemberWasteWindowBound = {
  name: 'december-waste-window-bound',
  validate: validateDecemberWasteWindowBound
}
