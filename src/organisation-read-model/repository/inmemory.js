import Boom from '@hapi/boom'

import {
  anchoredPattern,
  escapeRegex,
  normaliseCriteria,
  parseOrgIdCriterion
} from '#repositories/organisations/helpers.js'

/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { FindParams, OrganisationReadRepository } from './port.js' */

/**
 * @param {string} value
 * @returns {(candidate: string | null | undefined) => boolean}
 */
const anchoredMatcher = (value) => {
  const pattern = new RegExp(anchoredPattern(value), 'i')
  return (candidate) => typeof candidate === 'string' && pattern.test(candidate)
}

/**
 * @param {Omit<FindParams, 'page' | 'pageSize'>} criteria
 * @returns {(organisation: Organisation) => boolean} - whether the organisation satisfies every criterion
 */
const buildFindMatcher = ({ organisationNumber, ...criteria }) => {
  const { search, orgId, registrationNumber, accreditationNumber } =
    normaliseCriteria({ ...criteria, orgId: organisationNumber })

  /** @type {Array<(organisation: Organisation) => boolean>} */
  const checks = []
  if (search !== '') {
    const pattern = new RegExp(escapeRegex(search), 'i')
    checks.push(({ name }) => pattern.test(name))
  }
  if (orgId !== '') {
    const wanted = parseOrgIdCriterion(orgId)
    checks.push(({ organisationNumber: number }) => Number(number) === wanted)
  }
  if (registrationNumber !== '') {
    const matchesNumber = anchoredMatcher(registrationNumber)
    checks.push(({ registrations }) =>
      Object.keys(registrations).some(matchesNumber)
    )
  }
  if (accreditationNumber !== '') {
    const matchesNumber = anchoredMatcher(accreditationNumber)
    checks.push(({ registrations }) =>
      Object.values(registrations).some(({ accreditations }) =>
        Object.values(accreditations).some((accreditation) =>
          matchesNumber(accreditation.accreditationNumber)
        )
      )
    )
  }

  return (organisation) => checks.every((check) => check(organisation))
}

/**
 * @param {Organisation} one
 * @param {Organisation} other
 */
const byName = (one, other) => {
  if (one.name < other.name) {
    return -1
  }
  if (one.name > other.name) {
    return 1
  }
  return 0
}

/**
 * Serves organisations already in the read model's shape. Nothing writes to
 * it, so a version below `minimumVersion` can never arrive.
 *
 * @param {Organisation[]} [organisations]
 * @returns {() => OrganisationReadRepository}
 */
export const createInMemoryOrganisationReadRepository = (
  organisations = []
) => {
  const stored = structuredClone(organisations)

  return () => ({
    findByOrganisationNumber: async (organisationNumber, minimumVersion) => {
      const organisation = stored.find(
        (candidate) => candidate.organisationNumber === organisationNumber
      )
      if (!organisation) {
        return null
      }
      if (
        minimumVersion !== undefined &&
        organisation.version < minimumVersion
      ) {
        throw Boom.internal('Consistency timeout waiting for minimum version')
      }
      return structuredClone(organisation)
    },

    find: async ({ page, pageSize, ...criteria }) => {
      const matches = stored.filter(buildFindMatcher(criteria)).toSorted(byName)
      const start = (page - 1) * pageSize

      return {
        items: structuredClone(matches.slice(start, start + pageSize)),
        page,
        pageSize,
        totalItems: matches.length,
        totalPages: Math.ceil(matches.length / pageSize)
      }
    }
  })
}
