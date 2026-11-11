import { toYear } from '#common/helpers/dates/year.js'

/** @import {Year} from '#common/helpers/dates/year.js' */

const FIRST_TEMPLATE_YEAR = 2026

/**
 * The year of templates whose version carries no year, such as 5 or 2.1.
 */
export const DEFAULT_TEMPLATE_YEAR = toYear(FIRST_TEMPLATE_YEAR)

const FIRST_YEAR_VERSIONED_TEMPLATE = 2027

/**
 * The year a template version belongs to (ADR 0055). Templates are versioned
 * YYYY.XX from 2027, so 2027.01 is 2027. Any lower version, such as 5 or 2.1,
 * is DEFAULT_TEMPLATE_YEAR. Whether a template exists for the year is not
 * judged here.
 *
 * @param {number} version
 * @returns {Year}
 */
export const templateYear = (version) =>
  version >= FIRST_YEAR_VERSIONED_TEMPLATE
    ? toYear(Math.trunc(version))
    : DEFAULT_TEMPLATE_YEAR
