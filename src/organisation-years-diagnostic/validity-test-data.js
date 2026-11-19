import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import {
  buildAccreditation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
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

/**
 * An approved registration valid from the start of 2026.
 *
 * @param {object} overrides
 */
export const buildInYearRegistration = (overrides) =>
  buildRegistration({
    id: 'reg-1',
    registrationNumber: toRegistrationNumber('R26ER500001PL'),
    status: 'approved',
    validFrom: '2026-01-01',
    ...overrides
  })

/**
 * An approved accreditation valid for the whole of 2026.
 *
 * @param {object} overrides
 */
export const buildInYearAccreditation = (overrides) =>
  buildAccreditation({
    id: 'acc-1',
    accreditationNumber: toAccreditationNumber('A26ER500001PL'),
    status: 'approved',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    ...overrides
  })
