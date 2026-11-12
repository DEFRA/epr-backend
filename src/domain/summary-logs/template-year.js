import { toYear } from '#common/helpers/dates/year.js'

/** @import {Year} from '#common/helpers/dates/year.js' */

const FIRST_TEMPLATE_YEAR = 2026

/**
 * The year of templates whose version carries no year, such as 5 or 2.1.
 */
export const DEFAULT_TEMPLATE_YEAR = toYear(FIRST_TEMPLATE_YEAR)

const FIRST_YEAR_VERSIONED_TEMPLATE = 2027

/**
 * The year a template version belongs to (ADR 0055).
 *
 * @param {number} version
 * @returns {Year}
 */
export const templateYear = (version) =>
  version >= FIRST_YEAR_VERSIONED_TEMPLATE
    ? toYear(Math.trunc(version))
    : DEFAULT_TEMPLATE_YEAR

/**
 * The year of templates a partition's rows were submitted on: years before
 * DEFAULT_TEMPLATE_YEAR had no templates of their own and used its templates.
 *
 * @param {Year} year
 * @returns {Year}
 */
export const templateYearOf = (year) =>
  year < DEFAULT_TEMPLATE_YEAR ? DEFAULT_TEMPLATE_YEAR : year
