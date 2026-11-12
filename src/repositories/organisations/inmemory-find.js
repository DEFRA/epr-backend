import {
  anchoredPattern,
  escapeRegex,
  normaliseCriteria,
  parseOrgIdCriterion,
  storedOrgId
} from './helpers.js'

/** @import { FindParams, SearchCriteria } from './administration-port.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */

/**
 * How organisations are searched in memory. The in-memory organisations
 * repository and the in-memory organisation read repository share this
 * search, so both match criteria the same way. Each searches the shape it
 * returns: the organisations repository its stored organisations, the read
 * repository the read model's. So the two can find different organisations
 * for the same criteria.
 */

/**
 * The fields a search reads.
 *
 * @typedef {{
 *   organisationNumber: OrganisationNumber
 *   companyDetails: { name: string }
 *   registrations: Array<{ registrationNumber?: string | null }>
 *   accreditations: Array<{ accreditationNumber?: string | null }>
 * }} Searchable
 */

/**
 * @param {string} value
 * @returns {(candidate: string | null | undefined) => boolean}
 */
const anchoredMatcher = (value) => {
  const pattern = new RegExp(anchoredPattern(value), 'i')
  return (candidate) => pattern.test(candidate ?? '')
}

/**
 * The in-memory equivalent of the MongoDB find filter in mongodb-find.js. The
 * shared criteria semantics live in helpers.js and the find contract tests
 * hold the two implementations to the same behaviour.
 *
 * @param {SearchCriteria} criteria
 * @returns {(org: Searchable) => boolean} - true when the organisation
 *   satisfies every criterion
 */
const buildFindMatcher = (criteria) => {
  const {
    search,
    organisationNumber,
    registrationNumber,
    accreditationNumber
  } = normaliseCriteria(criteria)

  /** @type {Array<(org: Searchable) => boolean>} */
  const checks = []
  if (search !== '') {
    const pattern = new RegExp(escapeRegex(search), 'i')
    checks.push((org) => pattern.test(org.companyDetails.name))
  }
  if (organisationNumber !== '') {
    const wantedOrgId = parseOrgIdCriterion(organisationNumber)
    checks.push((org) => storedOrgId(org.organisationNumber) === wantedOrgId)
  }
  if (registrationNumber !== '') {
    const matchesNumber = anchoredMatcher(registrationNumber)
    checks.push((org) =>
      org.registrations.some((reg) => matchesNumber(reg.registrationNumber))
    )
  }
  if (accreditationNumber !== '') {
    const matchesNumber = anchoredMatcher(accreditationNumber)
    checks.push((org) =>
      org.accreditations.some((acc) => matchesNumber(acc.accreditationNumber))
    )
  }

  return (org) => checks.every((check) => check(org))
}

/**
 * Orders names by their UTF-8 bytes, as MongoDB sorts strings when no
 * collation is set, so both adapters give pages in the same order.
 *
 * @param {Searchable} one
 * @param {Searchable} other
 * @returns {number}
 */
const byCompanyName = (one, other) =>
  Buffer.compare(
    Buffer.from(one.companyDetails.name),
    Buffer.from(other.companyDetails.name)
  )

/**
 * The organisations matching every criterion, sorted by name, a page at a
 * time. The items are copies, so changing them changes nothing stored.
 *
 * @template {Searchable} T
 * @param {T[]} organisations
 * @param {FindParams} params
 * @returns {{ items: T[], page: number, pageSize: number, totalItems: number, totalPages: number }}
 */
export const findPage = (organisations, { page, pageSize, ...criteria }) => {
  const matches = organisations
    .filter(buildFindMatcher(criteria))
    .toSorted(byCompanyName)

  const totalItems = matches.length
  const totalPages = Math.ceil(totalItems / pageSize)
  const start = (page - 1) * pageSize
  const items = structuredClone(matches.slice(start, start + pageSize))

  return { items, page, pageSize, totalItems, totalPages }
}
