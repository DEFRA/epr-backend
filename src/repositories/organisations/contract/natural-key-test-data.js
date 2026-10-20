import { randomUUID } from 'node:crypto'

import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from './test-data.js'

/** @import { OrganisationsRepository } from '../port.js' */

/** @param {string} prefix */
export const uniqueNumber = (prefix) =>
  `${prefix}${randomUUID().slice(0, 8).toUpperCase()}`

/**
 * Stores an organisation holding one registration with a current and a
 * previous accreditation, and returns its numbers and stored ids.
 *
 * @param {OrganisationsRepository} organisationsRepository
 */
export const storeNumberedRegistration = async (organisationsRepository) => {
  const current = buildAccreditation({
    accreditationNumber: uniqueNumber('ACC')
  })
  const previous = buildAccreditation({
    accreditationNumber: uniqueNumber('ACC')
  })
  const registration = buildRegistration({
    registrationNumber: uniqueNumber('REG'),
    accreditationId: current.id
  })
  const organisation = buildOrganisation({
    registrations: [registration],
    accreditations: [current, previous]
  })
  await organisationsRepository.insert(organisation)

  return {
    key: {
      organisationNumber: String(organisation.orgId),
      registrationNumber: registration.registrationNumber
    },
    unknownOrganisationNumber: String(organisation.orgId + 1),
    ids: {
      organisationId: organisation.id,
      registrationId: registration.id
    },
    current,
    previous
  }
}
