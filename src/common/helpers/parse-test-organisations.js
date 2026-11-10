import { config } from '#root/config.js'
import {
  ORGANISATION_NUMBER_PATTERN,
  organisationNumberOf,
  toOrganisationNumber
} from '#domain/organisations/numbers.js'

/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */

/** @returns {OrganisationNumber[]} */
export function parseTestOrganisationNumbers() {
  const raw = config.get('testOrganisations')

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error('Invalid testOrganisations configuration: malformed JSON', {
      cause: error
    })
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Invalid testOrganisations configuration: not an array')
  }

  return parsed
    .map(Number)
    .filter((n) => Number.isSafeInteger(n) && n > 0)
    .map((n) => toOrganisationNumber(String(n)))
}

/** @type {ReadonlySet<OrganisationNumber>} */
export const TEST_ORGANISATION_NUMBERS = new Set(parseTestOrganisationNumbers())

/**
 * An organisation without a valid organisation number is never a test
 * organisation, so a bad stored `orgId` cannot fail the caller's whole read.
 *
 * @param {Pick<Organisation, 'orgId'>} organisation
 */
export const isTestOrganisation = (organisation) =>
  ORGANISATION_NUMBER_PATTERN.test(String(organisation.orgId)) &&
  TEST_ORGANISATION_NUMBERS.has(organisationNumberOf(organisation))
