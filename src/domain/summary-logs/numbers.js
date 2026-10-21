import { toOrganisationNumber } from '#domain/organisations/numbers.js'

/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {SummaryLog} from '#domain/summary-logs/model.js' */

/**
 * The numbers a summary log stores beside the ids it holds. The accreditation
 * number is `null` for a registered-only summary log, and absent when the
 * summary log holds no accreditation id.
 *
 * @typedef {Pick<SummaryLog, 'organisationNumber' | 'registrationNumber' | 'accreditationNumber'>} SummaryLogNumbers
 */

/**
 * Reads a summary log's numbers from its organisation record. A registration
 * or accreditation without a number, or one the organisation no longer holds,
 * gives no number, and `unmapped` says why.
 *
 * @param {Organisation} organisation
 * @param {{ registrationId: string, accreditationId?: string | null }} ids
 * @returns {{ numbers: SummaryLogNumbers, unmapped: string[] }}
 */
export const numbersForSummaryLog = (
  organisation,
  { registrationId, accreditationId }
) => {
  /** @type {SummaryLogNumbers} */
  const numbers = {
    organisationNumber: toOrganisationNumber(String(organisation.orgId))
  }
  /** @type {string[]} */
  const unmapped = []

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
