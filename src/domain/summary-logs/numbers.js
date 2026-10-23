import {
  ORGANISATION_NUMBER_PATTERN,
  toOrganisationNumber
} from '#domain/organisations/numbers.js'

/** @import {AccreditationNumber, OrganisationNumber, RegistrationNumber} from '#domain/organisations/numbers.js' */
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
 * Names a registration's summary logs by the numbers the domain issues, in
 * place of their database ids.
 *
 * @typedef {Object} SummaryLogKey
 * @property {OrganisationNumber} organisationNumber
 * @property {RegistrationNumber} registrationNumber
 * @property {AccreditationNumber|null} [accreditationNumber] - `null` for registered-only;
 *   absent matches every accreditation
 * @property {number} [year] - Absent matches every year
 */

/**
 * Whether a summary log holds a number beside each of the ids it holds.
 *
 * @param {SummaryLog} summaryLog
 * @returns {summaryLog is SummaryLog & {
 *   organisationNumber: OrganisationNumber,
 *   registrationNumber: RegistrationNumber
 * }}
 */
export const holdsNumbers = (summaryLog) =>
  summaryLog.organisationNumber !== undefined &&
  summaryLog.registrationNumber !== undefined &&
  (summaryLog.accreditationId === undefined ||
    summaryLog.accreditationNumber !== undefined)

/**
 * The key naming the summary logs that share this one's registration, year
 * and accreditation.
 *
 * @param {SummaryLog} summaryLog
 * @returns {SummaryLogKey}
 */
export const summaryLogKeyOf = (summaryLog) => {
  if (!holdsNumbers(summaryLog)) {
    throw new TypeError('The summary log is missing one of its numbers')
  }
  const { organisationNumber, registrationNumber, accreditationNumber, year } =
    summaryLog
  return {
    organisationNumber,
    registrationNumber,
    ...(accreditationNumber !== undefined && { accreditationNumber }),
    ...(year !== undefined && { year })
  }
}

/**
 * Reads a summary log's numbers from its organisation record. An organisation,
 * registration or accreditation without a number, or one the organisation no
 * longer holds, gives no number, and `unmapped` says why.
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
