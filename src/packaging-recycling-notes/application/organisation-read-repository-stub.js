import { vi } from 'vitest'

/**
 * What the organisation read model finds for the accreditation a PRN was raised
 * against, reduced to the fields a PRN status transition reads.
 *
 * @param {{
 *   status?: string,
 *   submittedToRegulator?: string,
 *   wasteProcessingType?: 'reprocessor' | 'exporter',
 *   reprocessingType?: 'input' | 'output'
 * }} [accreditation]
 */
export const foundAccreditation = ({
  status = 'approved',
  submittedToRegulator = 'ea',
  wasteProcessingType = 'reprocessor',
  reprocessingType
} = {}) => ({
  registration: {
    submittedToRegulator: { code: submittedToRegulator },
    wasteProcessingType,
    reprocessingType
  },
  accreditation: { status: { current: status } }
})

/**
 * An organisation read repository that finds one accreditation, however it is
 * asked for.
 *
 * @param {Parameters<typeof foundAccreditation>[0]} [accreditation]
 * @returns {import('#organisation-read-model/repository/port.js').OrganisationReadRepository}
 */
export const stubOrganisationReadRepository = (accreditation) =>
  /** @type {*} */ ({
    findAccreditationByNumber: vi
      .fn()
      .mockResolvedValue(foundAccreditation(accreditation))
  })
