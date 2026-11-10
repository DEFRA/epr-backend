import { ORGANISATION_NUMBER_PATTERN, toOrganisationNumber } from './numbers.js'

/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {Numbers, RequiredNumbers} from '#domain/organisations/numbers.js' */

/**
 * Reads the numbers for a registration, and optionally an accreditation, from
 * their organisation record. An organisation, registration or accreditation
 * without a number, or one the organisation no longer holds, gives no number,
 * and `unmapped` says why.
 *
 * @param {Organisation} organisation
 * @param {{ registrationId: string, accreditationId?: string | null }} ids
 * @returns {{ numbers: Numbers, unmapped: string[] }}
 */
export const numbersFor = (
  organisation,
  { registrationId, accreditationId }
) => {
  /** @type {Numbers} */
  const numbers = {}
  /** @type {string[]} */
  const unmapped = []

  const organisationNumber = String(organisation.orgId)
  if (ORGANISATION_NUMBER_PATTERN.test(organisationNumber)) {
    numbers.organisationNumber = toOrganisationNumber(organisationNumber)
  } else {
    unmapped.push(`organisation ${organisation.id} has no organisation number`)
  }

  const registration = organisation.registrations.find(
    ({ id }) => id === registrationId
  )
  if (!registration) {
    unmapped.push(
      `organisation ${organisation.id} holds no registration ${registrationId}`
    )
  } else if (registration.registrationNumber) {
    numbers.registrationNumber = registration.registrationNumber
  } else {
    unmapped.push(`registration ${registrationId} has no registration number`)
  }

  if (accreditationId === undefined) {
    return { numbers, unmapped }
  }
  if (accreditationId === null) {
    numbers.accreditationNumber = null
    return { numbers, unmapped }
  }

  const accreditation = organisation.accreditations.find(
    ({ id }) => id === accreditationId
  )
  if (!accreditation) {
    unmapped.push(
      `organisation ${organisation.id} holds no accreditation ${accreditationId}`
    )
  } else if (accreditation.accreditationNumber) {
    numbers.accreditationNumber = accreditation.accreditationNumber
  } else {
    unmapped.push(
      `accreditation ${accreditationId} has no accreditation number`
    )
  }

  return { numbers, unmapped }
}

/**
 * Reads every number for a registration and its accreditation, or its null
 * accreditation id, from their organisation record. Refuses where the record
 * does not give them all, so nothing is stored without its numbers.
 *
 * @param {Organisation} organisation
 * @param {{ registrationId: string, accreditationId: string | null }} ids
 * @param {string} documents - what would be stored, for the error
 * @returns {RequiredNumbers}
 */
export const requiredNumbersFor = (organisation, ids, documents) => {
  const {
    numbers: { organisationNumber, registrationNumber, accreditationNumber },
    unmapped
  } = numbersFor(organisation, ids)
  if (
    organisationNumber === undefined ||
    registrationNumber === undefined ||
    accreditationNumber === undefined
  ) {
    throw new Error(
      `Cannot store ${documents} without their numbers: ${unmapped.join('; ')}`
    )
  }
  return { organisationNumber, registrationNumber, accreditationNumber }
}
