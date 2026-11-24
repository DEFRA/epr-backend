import { escapeRegex } from '#repositories/organisations/helpers.js'

/** @import { FindParams } from './port.js' */

/**
 * What to search organisations for, and how both adapters read each
 * criterion, so they match the same organisations. Every criterion that
 * carries a value is ANDed with the others; an empty string or undefined is
 * treated as absent, so an empty object matches everything.
 *
 * Criteria match anywhere on the organisation's registrations and
 * accreditations — a registration criterion and an accreditation criterion are
 * not required to describe a linked pair.
 *
 * @typedef {Omit<FindParams, 'page' | 'pageSize'>} SearchCriteria
 */

const INTEGER_PATTERN = /^\d+$/

/**
 * @param {SearchCriteria} criteria
 * @returns {Required<SearchCriteria>} - every criterion trimmed, absent ones as ''
 */
export const normaliseCriteria = ({
  search,
  organisationNumber,
  registrationNumber,
  accreditationNumber
}) => ({
  search: (search ?? '').trim(),
  organisationNumber: (organisationNumber ?? '').trim(),
  registrationNumber: (registrationNumber ?? '').trim(),
  accreditationNumber: (accreditationNumber ?? '').trim()
})

/**
 * @param {string} value
 * @returns {number | null} - the stored orgId, or null when the value is not a number
 */
export const parseOrgIdCriterion = (value) =>
  INTEGER_PATTERN.test(value) ? Number(value) : null

/**
 * The pattern both adapters match numbers with: the whole value, escaped.
 * Each adapter turns this into its own form — a Mongo `$regex` fragment or a
 * JavaScript RegExp — so the matching semantics stay defined in one place.
 *
 * @param {string} value
 * @returns {string}
 */
export const anchoredPattern = (value) => `^${escapeRegex(value)}$`
