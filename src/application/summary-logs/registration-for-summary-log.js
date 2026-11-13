import Boom from '@hapi/boom'

/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import { OrganisationAdministrationRepository } from '#repositories/organisations/administration-port.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */

/**
 * @param {OrganisationAdministrationRepository} organisationAdministrationRepository
 * @param {SubmittedSummaryLog} summaryLog
 * @returns {Promise<Organisation>}
 */
const organisationFor = async (
  organisationAdministrationRepository,
  { organisationNumber }
) => {
  const organisation =
    await organisationAdministrationRepository.findByOrganisationNumber(
      organisationNumber
    )
  if (!organisation) {
    throw Boom.notFound(
      `Organisation with number ${organisationNumber} not found`
    )
  }
  return organisation
}

/**
 * The accreditation holding the summary log's number, or none for a
 * registered-only summary log.
 *
 * @param {Organisation} organisation
 * @param {SubmittedSummaryLog} summaryLog
 * @returns {Registration['accreditation']}
 */
const accreditationFor = (organisation, { accreditationNumber }) => {
  if (accreditationNumber === null) {
    return null
  }
  const accreditation = organisation.accreditations.find(
    (candidate) => candidate.accreditationNumber === accreditationNumber
  )
  if (!accreditation) {
    throw Boom.notFound(
      `Accreditation with number ${accreditationNumber} not found`
    )
  }
  return accreditation
}

/**
 * The registration a summary log is validated against, found by its numbers.
 *
 * @param {OrganisationAdministrationRepository} organisationAdministrationRepository
 * @param {SubmittedSummaryLog} summaryLog
 * @returns {Promise<Registration>}
 */
export const registrationForSummaryLog = async (
  organisationAdministrationRepository,
  summaryLog
) => {
  const organisation = await organisationFor(
    organisationAdministrationRepository,
    summaryLog
  )
  const registration = organisation.registrations.find(
    (candidate) =>
      candidate.registrationNumber === summaryLog.registrationNumber
  )
  if (!registration) {
    throw Boom.notFound(
      `Registration with number ${summaryLog.registrationNumber} not found`
    )
  }
  return {
    ...registration,
    accreditation: accreditationFor(organisation, summaryLog)
  }
}
