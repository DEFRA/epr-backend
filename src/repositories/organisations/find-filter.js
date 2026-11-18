import {
  anchoredPattern,
  escapeRegex,
  normaliseCriteria,
  parseOrgIdCriterion
} from './helpers.js'

/** @import { SearchCriteria } from './administration-port.js' */

/**
 * The MongoDB filter a search of `epr-organisations` applies. The
 * organisations repository and the organisation read model each read the
 * collection through their own find, and share this filter so they search it
 * the same way.
 */

/** Matches no organisation, used when a criterion cannot be parsed. */
const UNSATISFIABLE_FILTER = { _id: { $in: [] } }

/**
 * @param {string} value
 * @returns {{ $regex: string, $options: string }} - anchored, case-insensitive
 */
const anchoredCaseInsensitive = (value) => ({
  $regex: anchoredPattern(value),
  $options: 'i'
})

/**
 * @param {string} value
 * @returns {object} - the organisation-id fragment, unsatisfiable when unparseable
 */
const buildOrgIdFilter = (value) => {
  const orgId = parseOrgIdCriterion(value)
  return orgId === null ? UNSATISFIABLE_FILTER : { orgId }
}

/**
 * Builds the MongoDB filter for a find query. The in-memory equivalent is in
 * inmemory-find.js; the shared criteria semantics live in helpers.js and the
 * find contract tests hold the two implementations to the same behaviour.
 *
 * @param {SearchCriteria} criteria
 * @returns {object} - a filter matching organisations satisfying every criterion
 */
export const buildFindFilter = (criteria) => {
  const {
    search,
    organisationNumber,
    registrationNumber,
    accreditationNumber
  } = normaliseCriteria(criteria)

  const conditions = []
  if (search !== '') {
    conditions.push({
      'companyDetails.name': { $regex: escapeRegex(search), $options: 'i' }
    })
  }
  if (organisationNumber !== '') {
    conditions.push(buildOrgIdFilter(organisationNumber))
  }
  if (registrationNumber !== '') {
    conditions.push({
      'registrations.registrationNumber':
        anchoredCaseInsensitive(registrationNumber)
    })
  }
  if (accreditationNumber !== '') {
    conditions.push({
      'accreditations.accreditationNumber':
        anchoredCaseInsensitive(accreditationNumber)
    })
  }

  return conditions.length === 0 ? {} : { $and: conditions }
}
