import { config } from '#root/config.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'

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

/** @param {Pick<Organisation, 'organisationNumber'>} organisation */
export const isTestOrganisation = (organisation) =>
  TEST_ORGANISATION_NUMBERS.has(organisation.organisationNumber)
