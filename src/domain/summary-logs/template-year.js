import { toYear } from '#common/helpers/dates/year.js'

/** @import {Year} from '#common/helpers/dates/year.js' */

const FIRST_TEMPLATE_YEAR = 2026

/**
 * The year of templates whose version carries no year, such as 5 or 2.1.
 */
export const DEFAULT_TEMPLATE_YEAR = toYear(FIRST_TEMPLATE_YEAR)

const FIRST_FOUR_DIGIT_NUMBER = 1000
const FIRST_FIVE_DIGIT_NUMBER = 10000

/**
 * The year a template version belongs to (ADR 0055): the integer part of a
 * YYYY.XX version, e.g. 2027.01 is 2027. Any other version is
 * DEFAULT_TEMPLATE_YEAR. Whether a template exists for the year is not
 * judged here.
 *
 * @param {number} version
 * @returns {Year}
 */
export const templateYear = (version) => {
  const integerPart = Math.trunc(version)

  return integerPart >= FIRST_FOUR_DIGIT_NUMBER &&
    integerPart < FIRST_FIVE_DIGIT_NUMBER
    ? toYear(integerPart)
    : DEFAULT_TEMPLATE_YEAR
}
