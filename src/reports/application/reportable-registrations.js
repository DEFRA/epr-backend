import { TEST_ORGANISATION_NUMBERS } from '#common/helpers/parse-test-organisations.js'
import { toRegistrationNumber } from '#shared/organisations/numbers.js'
import { registrationKey } from '#reports/domain/registration-key.js'

/**
 * @import { OrganisationNumber, RegistrationNumber } from '#shared/organisations/numbers.js'
 * @import { Organisation, Registration } from '#organisation-read-model/domain/model.js'
 *
 * @typedef {{
 *   organisation: Organisation,
 *   organisationNumber: OrganisationNumber,
 *   registrationNumber: RegistrationNumber,
 *   registration: Registration,
 *   key: string
 * }} ReportableRegistration
 */

/**
 * Every registration the read model serves, outside test organisations, with
 * the key its reports are grouped under. The read model serves only approved
 * and cancelled registrations.
 *
 * @param {Organisation[]} organisations
 * @returns {ReportableRegistration[]}
 */
export const reportableRegistrations = (organisations) =>
  organisations
    .filter(
      ({ organisationNumber }) =>
        !TEST_ORGANISATION_NUMBERS.has(organisationNumber)
    )
    .flatMap((organisation) =>
      Object.entries(organisation.registrations).map(
        ([number, registration]) => {
          const { organisationNumber } = organisation
          const registrationNumber = toRegistrationNumber(number)
          return {
            organisation,
            organisationNumber,
            registrationNumber,
            registration,
            key: registrationKey({ organisationNumber, registrationNumber })
          }
        }
      )
    )
