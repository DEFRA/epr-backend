import Boom from '@hapi/boom'

import { ACTIVE_ACCREDITATION_STATUSES } from '#domain/organisations/model.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { reportOperatorCategory } from '#reports/domain/operator-category.js'
import { accreditationNumbered } from '#waste-balances/application/read-model-accreditations.js'

/** @import {Year} from '#common/helpers/dates/year.js' */
/** @import {AccreditationStatus} from '#domain/organisations/model.js' */
/** @import {RegistrationNumber} from '#domain/organisations/numbers.js' */
/** @import {AccreditationCommon, Registration} from '#organisation-read-model/domain/model.js' */
/** @import {OrganisationReadRepository} from '#organisation-read-model/repository/port.js' */
/** @import {Cadence} from '#reports/domain/cadence.js' */
/** @import {OperatorCategory} from '#reports/domain/operator-category.js' */
/** @import {SubmittedSummaryLog} from './validate-issue-logging.js' */

/**
 * A summary log's registration as the read model serves it, with its number,
 * and the accreditation its number names with that accreditation's year (none
 * for a registered-only summary log).
 *
 * @typedef {Registration & {
 *   registrationNumber: RegistrationNumber,
 *   accreditation: AccreditationCommon | null,
 *   accreditationYear: Year | null
 * }} SummaryLogRegistration
 */

/**
 * @param {Registration} registration
 * @param {SubmittedSummaryLog} summaryLog
 * @returns {[Year, AccreditationCommon] | [null, null]}
 */
const accreditationFor = (registration, { accreditationNumber }) => {
  if (accreditationNumber === null) {
    return [null, null]
  }
  const held = accreditationNumbered(registration, accreditationNumber)
  if (!held) {
    throw Boom.notFound(
      `Accreditation with number ${accreditationNumber} not found`
    )
  }
  return [held.year, held.accreditation]
}

/**
 * The registration a summary log is validated against, found by its numbers.
 *
 * @param {OrganisationReadRepository} organisationReadRepository
 * @param {SubmittedSummaryLog} summaryLog
 * @returns {Promise<SummaryLogRegistration>}
 */
export const registrationForSummaryLog = async (
  organisationReadRepository,
  summaryLog
) => {
  if (summaryLog.registrationNumber === undefined) {
    throw new Error('Summary log has no registration number')
  }
  if (summaryLog.accreditationNumber === undefined) {
    throw new Error('Summary log has no accreditation number')
  }
  const { organisationNumber, registrationNumber } = summaryLog
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
  const [accreditationYear, accreditation] = accreditationFor(
    registration,
    summaryLog
  )
  return {
    ...registration,
    registrationNumber,
    accreditation,
    accreditationYear
  }
}

/**
 * Whether the summary log is accredited: its accreditation is approved or
 * suspended today.
 *
 * @param {Pick<SummaryLogRegistration, 'accreditation'>} registration
 * @returns {boolean}
 */
const isAccredited = ({ accreditation }) =>
  accreditation !== null &&
  ACTIVE_ACCREDITATION_STATUSES.has(
    /** @type {AccreditationStatus} */ (accreditation.status.current)
  )

/**
 * An accredited operator reports monthly, a registered-only one quarterly.
 *
 * @param {Pick<SummaryLogRegistration, 'accreditation'>} registration
 * @returns {Cadence}
 */
export const reportingCadenceOf = (registration) =>
  isAccredited(registration) ? CADENCE.monthly : CADENCE.quarterly

/**
 * @param {SummaryLogRegistration} registration
 * @returns {OperatorCategory}
 */
export const operatorCategoryOf = (registration) =>
  reportOperatorCategory({
    registration,
    accreditation: registration.accreditation
  })
