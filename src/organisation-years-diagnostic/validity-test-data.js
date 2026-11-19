import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import { partialMock } from '#test/type-helpers.js'

/** @import { Accreditation } from '#domain/organisations/accreditation.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { Registration } from '#domain/organisations/registration.js' */

/**
 * `buildRegistration` returns a loose record, so registrations are cast.
 *
 * @param {{ registrations?: Record<string, any>[], accreditations?: Accreditation[], organisationNumber?: string }} parts
 * @returns {Organisation}
 */
export const buildStoredOrganisation = ({
  registrations = [],
  accreditations = [],
  organisationNumber = '500001'
}) =>
  partialMock({
    organisationNumber: toOrganisationNumber(organisationNumber),
    registrations: /** @type {Registration[]} */ (registrations),
    accreditations
  })
