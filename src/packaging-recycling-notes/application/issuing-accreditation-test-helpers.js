import { toYear } from '#common/helpers/dates/year.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { AccreditationNumber, OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { Organisation, Registration } from '#organisation-read-model/domain/model.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/repository/port.js' */

/**
 * @typedef {{
 *   organisationNumber: OrganisationNumber,
 *   registrationNumber: RegistrationNumber,
 *   accreditationNumber: AccreditationNumber,
 *   year?: Year,
 *   status?: 'approved' | 'suspended' | 'cancelled',
 *   submittedToRegulator?: 'ea' | 'nrw' | 'sepa' | 'niea',
 *   wasteProcessingType?: 'reprocessor' | 'exporter',
 *   reprocessingType?: 'input' | 'output',
 *   withAccreditation?: boolean
 * }} HeldAccreditation
 */

/**
 * @param {HeldAccreditation} held
 * @returns {Registration}
 */
const heldRegistration = ({
  accreditationNumber,
  year = toYear(2026),
  status = 'approved',
  submittedToRegulator = 'ea',
  wasteProcessingType = WASTE_PROCESSING_TYPE.REPROCESSOR,
  reprocessingType = 'input',
  withAccreditation = true
}) => {
  const accreditations = withAccreditation
    ? {
        [String(year)]: {
          accreditationNumber,
          prnIssuance: { tonnageBand: 'up_to_500' },
          status: { current: status, timeline: [] }
        }
      }
    : {}
  const common = {
    material: 'plastic',
    submittedToRegulator: { code: submittedToRegulator }
  }
  return /** @type {Registration} */ (
    /** @type {unknown} */ (
      wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER
        ? {
            ...common,
            wasteProcessingType,
            overseasSites: {},
            accreditations
          }
        : {
            ...common,
            wasteProcessingType,
            reprocessingType,
            site: {
              address: {
                line1: '1 Test Street',
                town: 'Testville',
                postcode: 'SW1A 1AA'
              }
            },
            accreditations
          }
    )
  )
}

/**
 * An organisation read repository serving one organisation, with one
 * registration holding an accreditation for one year, for tests of PRN code
 * that reads the accreditation a PRN was raised against.
 *
 * @param {HeldAccreditation} held
 * @returns {OrganisationReadRepository}
 */
export const readRepositoryHolding = (held) => {
  const organisation = /** @type {Organisation} */ (
    /** @type {unknown} */ ({
      organisationNumber: held.organisationNumber,
      name: 'Test Reprocessor',
      registrations: { [held.registrationNumber]: heldRegistration(held) }
    })
  )
  return {
    findByOrganisationNumber: async (organisationNumber) =>
      organisationNumber === held.organisationNumber ? organisation : null,
    find: async () => ({
      items: [organisation],
      page: 1,
      pageSize: 1,
      totalItems: 1,
      totalPages: 1
    }),
    findAll: async () => [organisation]
  }
}
