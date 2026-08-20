import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { toRegistrationSummary } from '#application/organisations/registration-summary.js'
import { resolveNumberedAccreditations } from '#domain/organisations/registration-utils.js'
import { registrationDetailsResponseSchema } from './response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { NumberedAccreditation } from '#domain/organisations/registration-utils.js' */

/**
 * One row of the accredited periods table: which accreditation, how long it
 * ran, and what became of it.
 *
 * @typedef {{
 *   id: string;
 *   accreditationNumber: string;
 *   status: string;
 *   validFrom: string | null;
 *   validTo: string | null;
 * }} AccreditedPeriod
 */

export const registrationDetailsGetPath =
  '/v1/admin/organisations/{organisationId}/registrations/{registrationId}'

export const registrationDetailsGet = {
  method: 'GET',
  path: registrationDetailsGetPath,
  options: {
    auth: {
      // An operator earns `organisation.read` for their own organisation, and
      // this route names one, so that scope alone would admit them to an admin
      // page. See REGULATOR_SCOPES for why `organisation.search` is the scope
      // that refuses them and still admits every admin tier and the regulator.
      scope: [`+${SCOPES.organisationRead}`, `+${SCOPES.organisationSearch}`]
    },
    tags: ['api', 'admin'],
    response: {
      schema: registrationDetailsResponseSchema
    }
  },
  /**
   * @param {HapiRequest & {
   *   params: { organisationId: string, registrationId: string }
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisationsRepository } = request
    const { organisationId, registrationId } = request.params

    const organisation = await organisationsRepository.findById(organisationId)

    const registration = organisation.registrations.find(
      (candidate) => candidate.id === registrationId
    )

    if (!registration) {
      throw Boom.notFound('Registration not found')
    }

    return h
      .response({
        organisationId: organisation.id,
        companyName: organisation.companyDetails.name,
        registration: toRegistrationSummary(registration),
        accreditations: resolveNumberedAccreditations(
          registration,
          organisation
        ).map(toAccreditedPeriod)
      })
      .code(StatusCodes.OK)
  }
}

/**
 * @param {NumberedAccreditation} accreditation
 * @returns {AccreditedPeriod}
 */
function toAccreditedPeriod(accreditation) {
  return {
    id: accreditation.id,
    accreditationNumber: accreditation.accreditationNumber,
    status: accreditation.status,
    validFrom: accreditation.validFrom ?? null,
    validTo: accreditation.validTo ?? null
  }
}
