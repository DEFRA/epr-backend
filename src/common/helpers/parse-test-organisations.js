import { config } from '#root/config.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'

export function parseTestOrganisationIds() {
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

  return parsed.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0)
}

export const TEST_ORGANISATION_IDS = new Set(parseTestOrganisationIds())

export function parseTestOrganisationNumbers() {
  return parseTestOrganisationIds().map((orgId) =>
    toOrganisationNumber(String(orgId))
  )
}

export const TEST_ORGANISATION_NUMBERS = parseTestOrganisationNumbers()
