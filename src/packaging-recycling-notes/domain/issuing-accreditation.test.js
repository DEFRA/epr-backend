import { toYear } from '#common/helpers/dates/year.js'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'

import { toIssuingAccreditation } from './issuing-accreditation.js'

/** @import { AccreditationCommon, Registration } from '#organisation-read-model/domain/model.js' */

const YEAR = toYear(2026)

/** @type {AccreditationCommon} */
const accreditation = {
  accreditationNumber: toAccreditationNumber('A26ER5001180114PL'),
  prnIssuance: { tonnageBand: 'up_to_500' },
  status: { current: 'suspended', timeline: [] }
}

/**
 * @param {object} [overrides]
 * @returns {Registration}
 */
const reprocessorRegistration = (overrides = {}) =>
  /** @type {Registration} */ (
    /** @type {unknown} */ ({
      wasteProcessingType: 'reprocessor',
      reprocessingType: 'output',
      material: 'plastic',
      submittedToRegulator: { code: 'nrw' },
      site: {
        address: { line1: '1 Mill Lane', town: 'Leeds', postcode: 'LS1 4AB' }
      },
      accreditations: {},
      ...overrides
    })
  )

describe('toIssuingAccreditation', () => {
  it('states what the PRN rules read about a reprocessor accreditation', () => {
    expect(
      toIssuingAccreditation(reprocessorRegistration(), accreditation, YEAR)
    ).toStrictEqual({
      accreditationNumber: 'A26ER5001180114PL',
      accreditationYear: YEAR,
      status: 'suspended',
      submittedToRegulator: 'nrw',
      wasteProcessingType: 'reprocessor',
      reprocessingType: 'output',
      material: 'plastic',
      siteAddress: { line1: '1 Mill Lane', town: 'Leeds', postcode: 'LS1 4AB' }
    })
  })

  it('keeps the optional parts of the site address', () => {
    const address = {
      line1: '1 Mill Lane',
      line2: 'Unit 4',
      town: 'Leeds',
      county: 'West Yorkshire',
      postcode: 'LS1 4AB',
      country: 'England'
    }

    const { siteAddress } = toIssuingAccreditation(
      reprocessorRegistration({
        site: { address: { ...address, region: 'x' } }
      }),
      accreditation,
      YEAR
    )

    expect(siteAddress).toStrictEqual(address)
  })

  it('states a site address without a town when the read model has none', () => {
    const { siteAddress } = toIssuingAccreditation(
      reprocessorRegistration({
        site: {
          address: {
            line1: '1 Mill Lane',
            postcode: 'LS1 4AB',
            fullAddress: '1 Mill Lane, Unit 4, Leeds, Yorks, UK, LS1 4AB'
          }
        }
      }),
      accreditation,
      YEAR
    )

    expect(siteAddress).toStrictEqual({
      line1: '1 Mill Lane',
      postcode: 'LS1 4AB'
    })
  })

  it('states a glass registration as glass and its recycling process', () => {
    expect(
      toIssuingAccreditation(
        reprocessorRegistration({ material: 'glass_re_melt' }),
        accreditation,
        YEAR
      )
    ).toMatchObject({
      material: 'glass',
      glassRecyclingProcess: 'glass_re_melt'
    })
  })

  it('states no site or reprocessing type for an exporter', () => {
    const issuing = toIssuingAccreditation(
      /** @type {Registration} */ (
        /** @type {unknown} */ ({
          wasteProcessingType: 'exporter',
          material: 'plastic',
          submittedToRegulator: { code: 'ea' },
          overseasSites: {},
          accreditations: {}
        })
      ),
      accreditation,
      YEAR
    )

    expect(issuing).not.toHaveProperty('siteAddress')
    expect(issuing).not.toHaveProperty('reprocessingType')
    expect(issuing.wasteProcessingType).toBe('exporter')
  })

  it('refuses a reprocessor whose site the read model holds only as a full address', () => {
    expect(() =>
      toIssuingAccreditation(
        reprocessorRegistration({
          site: { address: { fullAddress: '1 Mill Lane Leeds LS1 4AB' } }
        }),
        accreditation,
        YEAR
      )
    ).toThrow(
      'Reprocessor site address has no line1 and postcode to state on a PRN'
    )
  })
})
