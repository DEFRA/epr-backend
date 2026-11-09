/**
 * @import { Organisation } from '#domain/organisations/model.js'
 * @import { Registration } from '#domain/organisations/registration.js'
 */

/**
 * The key joining a registration's reports to it.
 *
 * @param {{ organisationNumber: string, registrationNumber?: string | null }} numbers
 * @returns {string}
 */
export const registrationKey = ({ organisationNumber, registrationNumber }) =>
  `${organisationNumber}::${registrationNumber}`

/**
 * @param {Pick<Organisation, 'orgId'>} organisation
 * @param {Pick<Registration, 'registrationNumber'>} registration
 * @returns {string}
 */
export const storedRegistrationKey = (organisation, registration) =>
  registrationKey({
    organisationNumber: String(organisation.orgId),
    registrationNumber: registration.registrationNumber
  })
