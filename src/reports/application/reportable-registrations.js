import { TEST_ORGANISATION_NUMBERS } from '#common/helpers/parse-test-organisations.js'
import { registrationKey } from '#reports/domain/registration-key.js'

/**
 * @import { Organisation, Registration } from '#organisation-read-model/domain/model.js'
 *
 * @typedef {{
 *   organisation: Organisation,
 *   registrationNumber: string,
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
        ([registrationNumber, registration]) => ({
          organisation,
          registrationNumber,
          registration,
          key: registrationKey({
            organisationNumber: organisation.organisationNumber,
            registrationNumber
          })
        })
      )
    )
