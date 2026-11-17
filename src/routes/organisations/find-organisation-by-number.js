import Boom from '@hapi/boom'

import { servesOrganisationOn } from '#organisation-read-model/index.js'
import { toCalendarDate } from '#common/helpers/date-formatter.js'

/**
 * @import { OrganisationNumber } from '#domain/organisations/numbers.js'
 * @import { ManagedOrganisation, OrganisationLinkingRepository } from '#repositories/organisations/linking-port.js'
 */

/**
 * Finds the stored organisation a route names by its number. Only an
 * organisation the organisation read model serves can be found.
 *
 * @param {OrganisationLinkingRepository} organisationLinkingRepository
 * @param {OrganisationNumber} organisationNumber
 * @returns {Promise<ManagedOrganisation>}
 */
export async function findOrganisationByNumber(
  organisationLinkingRepository,
  organisationNumber
) {
  const organisation =
    await organisationLinkingRepository.findByOrganisationNumber(
      organisationNumber
    )
  if (
    !organisation ||
    !servesOrganisationOn(organisation, toCalendarDate(new Date()))
  ) {
    throw Boom.notFound('Organisation not found')
  }
  return organisation
}
