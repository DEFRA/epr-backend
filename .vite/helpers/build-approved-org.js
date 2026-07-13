import {
  ORGANISATION_STATUS,
  REG_ACC_STATUS,
  REPROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  buildOrganisation,
  prepareOrgUpdate,
  getValidDateRange
} from '#repositories/organisations/contract/test-data.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'

/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { RegistrationOther } from '#domain/organisations/registration.js' */

/**
 * @param {OrganisationsRepository} organisationsRepository
 * @param {object} [overrides]
 * @param {{ VALID_FROM: string, VALID_TO: string }} [dateRange] - Accreditation/registration validity range (defaults to today .. one year on)
 * @returns {Promise<Organisation>}
 */
export async function buildApprovedOrg(
  organisationsRepository,
  overrides,
  dateRange = getValidDateRange()
) {
  const org = buildOrganisation(overrides)

  const INITIAL_VERSION = 1

  await organisationsRepository.insert(org)

  const { VALID_FROM, VALID_TO } = dateRange

  // Only approve the first accreditation (which is already linked to the first registration)
  const approvedAccreditations = [
    {
      ...org.accreditations[0],
      status: REG_ACC_STATUS.APPROVED,
      accreditationNumber: org.accreditations[0].accreditationNumber || 'ACC1',
      validFrom: VALID_FROM,
      reprocessingType: REPROCESSING_TYPE.INPUT,
      validTo: VALID_TO
    }
  ]

  const approvedRegistrations = [
    Object.assign({}, org.registrations[0], {
      status: REG_ACC_STATUS.APPROVED,
      cbduNumber:
        /** @type {RegistrationOther} */ (org.registrations[0]).cbduNumber ||
        'CBDU123456',
      registrationNumber: 'REG1',
      reprocessingType: REPROCESSING_TYPE.INPUT,
      validFrom: VALID_FROM,
      validTo: VALID_TO
    })
  ]

  await organisationsRepository.replace(
    org.id,
    INITIAL_VERSION,
    prepareOrgUpdate(org, {
      status: ORGANISATION_STATUS.APPROVED,
      accreditations: approvedAccreditations,
      registrations: approvedRegistrations
    })
  )

  return waitForVersion(organisationsRepository, org.id, INITIAL_VERSION + 1)
}
