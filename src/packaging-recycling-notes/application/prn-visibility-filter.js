import { toOrganisationNumber } from '#domain/organisations/numbers.js'

/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */

/**
 * Resolves test organisation numeric IDs to organisation ids
 * for filtering test org PRNs from the external API.
 *
 * @param {Pick<OrganisationsRepository, 'findByOrganisationNumbers'>} organisationsRepository
 * @param {{ testOrganisationIds: Organisation['orgId'][] }} options
 * @returns {Promise<{ excludeOrganisationIds: Organisation['id'][] }>}
 */
export async function createPrnVisibilityFilter(
  organisationsRepository,
  { testOrganisationIds }
) {
  if (testOrganisationIds.length === 0) {
    return { excludeOrganisationIds: [] }
  }

  const organisations = await organisationsRepository.findByOrganisationNumbers(
    testOrganisationIds.map((orgId) => toOrganisationNumber(String(orgId)))
  )

  return { excludeOrganisationIds: organisations.map(({ id }) => id) }
}
