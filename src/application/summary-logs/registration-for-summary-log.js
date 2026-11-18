import Boom from '@hapi/boom'

import { HELD_ACCREDITATION_STATUSES } from '#organisation-read-model/index.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { indexByLedger } from '#waste-balances/application/read-model-accreditations.js'
import { ledgerKey } from '#waste-balances/repository/ledger-schema.js'

/** @import {RegistrationNumber} from '#domain/organisations/numbers.js' */
/** @import {Registration} from '#organisation-read-model/index.js' */
/** @import {OrganisationReadRepository} from '#organisation-read-model/index.js' */
/** @import {Cadence} from '#reports/domain/cadence.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */

/**
 * A summary log's registration as the read model serves it, and the
 * accreditation its number names, none for a registered-only summary log.
 *
 * @typedef {{
 *   registrationNumber: RegistrationNumber
 *   registration: Registration
 *   accreditation: Registration['accreditations'][string] | null
 * }} SummaryLogRegistration
 */

/**
 * The registration a summary log is validated and submitted against, found by
 * its numbers, and the accreditation its number holds for the summary log's
 * year.
 *
 * @param {OrganisationReadRepository} organisationReadRepository
 * @param {Pick<SubmittedSummaryLog, 'organisationNumber' | 'registrationNumber' | 'accreditationNumber' | 'year'>} summaryLog
 * @returns {Promise<SummaryLogRegistration>}
 */
export const registrationForSummaryLog = async (
  organisationReadRepository,
  { organisationNumber, registrationNumber, accreditationNumber, year }
) => {
  if (registrationNumber === undefined) {
    throw new Error('Summary log has no registration number')
  }
  const organisation =
    await organisationReadRepository.findByOrganisationNumber(
      organisationNumber
    )
  if (!organisation) {
    throw Boom.notFound(
      `Organisation with number ${organisationNumber} not found`
    )
  }
  if (!Object.hasOwn(organisation.registrations, registrationNumber)) {
    throw Boom.notFound(
      `Registration with number ${registrationNumber} not found`
    )
  }
  const registration = organisation.registrations[registrationNumber]
  if (accreditationNumber === null) {
    return { registrationNumber, registration, accreditation: null }
  }
  const held = indexByLedger([organisation], {
    includeTestOrganisations: true
  }).get(
    ledgerKey({
      organisationNumber,
      registrationNumber,
      accreditationNumber,
      year
    })
  )
  if (!held) {
    throw Boom.notFound(
      `Accreditation with number ${accreditationNumber} for ${year} not found`
    )
  }
  return { registrationNumber, registration, accreditation: held.accreditation }
}

/**
 * Whether the summary log is accredited: its accreditation is approved or
 * suspended today.
 *
 * @param {Pick<SummaryLogRegistration, 'accreditation'>} summaryLogRegistration
 * @returns {boolean}
 */
const isAccredited = ({ accreditation }) =>
  accreditation !== null &&
  HELD_ACCREDITATION_STATUSES.has(accreditation.status.current)

/**
 * An accredited operator reports monthly, a registered-only one quarterly.
 *
 * @param {Pick<SummaryLogRegistration, 'accreditation'>} summaryLogRegistration
 * @returns {Cadence}
 */
export const reportingCadenceOf = (summaryLogRegistration) =>
  isAccredited(summaryLogRegistration) ? CADENCE.monthly : CADENCE.quarterly
