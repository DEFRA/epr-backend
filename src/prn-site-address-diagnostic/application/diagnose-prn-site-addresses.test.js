import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import { toYear } from '#common/helpers/dates/year.js'
import {
  toAccreditationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  ACCREDITATION_NUMBER,
  REPROCESSOR_NUMBER,
  accreditation,
  exporter,
  exporterAccreditation,
  granted,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { partialMock } from '#test/type-helpers.js'

import { diagnosePrnSiteAddresses } from './diagnose-prn-site-addresses.js'

/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */

/** @import { ExternalAccreditation } from '#organisation-read-model/repository/to-read-model.js' */

const { buildOrganisation } = createOrganisationBuilders()

const TODAY = '2026-11-10'

const REGISTRATION_SITE = {
  line1: '7 Glass processing site',
  town: 'London',
  postcode: 'SW2A 0AA'
}

const FULL_ADDRESS_SITE = {
  fullAddress: '7 Glass processing site London SW2A 0AA'
}

/**
 * The organisations as the repository reads them, with their statuses.
 *
 * @param {ReturnType<typeof buildOrganisation>[]} organisations
 * @param {ExternalAccreditation[]} [externalAccreditations]
 */
const diagnose = async (organisations, externalAccreditations = []) =>
  diagnosePrnSiteAddresses(
    await createInMemoryOrganisationsRepository(
      organisations.map((organisation) => partialMock(organisation))
    )().findAll(),
    externalAccreditations,
    TODAY
  )

/**
 * A reprocessor registration at `registrationAddress`, accredited at
 * `accreditationAddress`.
 *
 * @param {{
 *   registrationAddress?: object,
 *   accreditationSite?: object,
 *   accreditationStatus?: 'approved' | 'suspended' | 'cancelled',
 *   organisationNumber?: OrganisationNumber
 * }} [options]
 */
const accreditedReprocessor = ({
  registrationAddress = REGISTRATION_SITE,
  accreditationSite = {
    address: { line1: '7 Glass processing site', postcode: 'SW2A 0AA' }
  },
  accreditationStatus = 'approved',
  organisationNumber
} = {}) => {
  const held = accreditation({
    site: accreditationSite,
    status: accreditationStatus,
    statusHistory: granted(accreditationStatus)
  })
  const registration = reprocessor({ accreditationId: held.id })
  return buildOrganisation({
    ...(organisationNumber && { organisationNumber }),
    registrations: [
      {
        ...registration,
        site: { ...registration.site, address: registrationAddress }
      }
    ],
    accreditations: [held]
  })
}

describe('diagnosePrnSiteAddresses', () => {
  it('reports nothing when the accreditation site matches the registration site', async () => {
    const { rows, summary } = await diagnose([accreditedReprocessor()])

    expect(rows).toStrictEqual([])
    expect(summary).toStrictEqual({
      scannedOrganisations: 1,
      checkedRegistrations: 1,
      fullAddressOnly: 0,
      fullOnlyHeld: 0,
      checkedAccreditations: 1,
      matched: 1,
      siteDiffers: 0,
      siteDiffersLine1: 0,
      siteDiffersPostcode: 0,
      siteDiffersBoth: 0,
      noAccreditationSite: 0
    })
  })

  it('treats case, spacing and postcode spaces as the same site', async () => {
    const { rows } = await diagnose([
      accreditedReprocessor({
        accreditationSite: {
          address: {
            line1: '  7 GLASS   processing site ',
            postcode: 'sw2a0aa'
          }
        }
      })
    ])

    expect(rows).toStrictEqual([])
  })

  it.each([
    ['line1', { line1: '7', postcode: 'SW2A 0AA' }],
    ['postcode', { line1: '7 Glass processing site', postcode: 'SW1A 1AA' }],
    ['both', { line1: '7', postcode: 'SW1A 1AA' }]
  ])(
    'reports an accreditation site differing by %s',
    async (differs, address) => {
      const organisation = accreditedReprocessor({
        accreditationSite: { address }
      })

      const { rows, summary } = await diagnose([organisation])

      expect(rows).toStrictEqual([
        {
          finding: 'siteDiffers',
          differs,
          organisationNumber: organisation.organisationNumber,
          testOrganisation: false,
          registrationNumber: REPROCESSOR_NUMBER,
          accreditationNumber: ACCREDITATION_NUMBER,
          year: '2026',
          status: 'approved'
        }
      ])
      expect(summary).toMatchObject({
        matched: 0,
        siteDiffers: 1,
        siteDiffersLine1: differs === 'line1' ? 1 : 0,
        siteDiffersPostcode: differs === 'postcode' ? 1 : 0,
        siteDiffersBoth: differs === 'both' ? 1 : 0
      })
    }
  )

  it('reports an accreditation with no site', async () => {
    const organisation = accreditedReprocessor({ accreditationSite: {} })

    const { rows, summary } = await diagnose([organisation])

    expect(rows).toStrictEqual([
      {
        finding: 'noAccreditationSite',
        organisationNumber: organisation.organisationNumber,
        testOrganisation: false,
        registrationNumber: REPROCESSOR_NUMBER,
        accreditationNumber: ACCREDITATION_NUMBER,
        year: '2026',
        status: 'approved'
      }
    ])
    expect(summary).toMatchObject({ matched: 0, noAccreditationSite: 1 })
  })

  it('reports a registration whose site the read model holds only as a full address, with the stored fields it has and its accreditations, without comparing them', async () => {
    const organisation = accreditedReprocessor({
      registrationAddress: {
        line1: '7',
        fullAddress: '7 Glass processing site London'
      }
    })

    const { rows, summary } = await diagnose([organisation])

    expect(rows).toStrictEqual([
      {
        finding: 'fullAddressOnly',
        organisationNumber: organisation.organisationNumber,
        testOrganisation: false,
        registrationNumber: REPROCESSOR_NUMBER,
        hasLine1: true,
        hasTown: false,
        hasPostcode: false,
        accreditations: 1,
        heldAccreditations: 1
      }
    ])
    expect(summary).toMatchObject({
      checkedRegistrations: 1,
      fullAddressOnly: 1,
      fullOnlyHeld: 1,
      checkedAccreditations: 0
    })
  })

  it.each([
    ['an approved', 'approved', 1],
    ['a suspended', 'suspended', 1],
    ['a cancelled', 'cancelled', 0]
  ])(
    'counts %s accreditation of a full-address registration as held only when it is not cancelled',
    async (_description, accreditationStatus, held) => {
      const organisation = accreditedReprocessor({
        registrationAddress: FULL_ADDRESS_SITE,
        accreditationStatus:
          /** @type {'approved' | 'suspended' | 'cancelled'} */ (
            accreditationStatus
          )
      })

      const { rows, summary } = await diagnose([organisation])

      expect(rows).toMatchObject([
        { accreditations: 1, heldAccreditations: held }
      ])
      expect(summary).toMatchObject({ fullOnlyHeld: held })
    }
  )

  it('counts the external accreditation that replaces a stored one, not the stored one', async () => {
    const organisation = accreditedReprocessor({
      registrationAddress: FULL_ADDRESS_SITE
    })

    const { rows } = await diagnose(
      [organisation],
      [
        {
          registrationNumber: toRegistrationNumber(REPROCESSOR_NUMBER),
          year: toYear(2026),
          accreditationNumber: toAccreditationNumber('A26ER5001180999PL'),
          prnIssuance: { tonnageBand: 'up_to_500' },
          status: { current: 'cancelled', timeline: [] }
        }
      ]
    )

    expect(rows).toMatchObject([{ accreditations: 1, heldAccreditations: 0 }])
  })

  it('counts a year only an external accreditation holds', async () => {
    const organisation = accreditedReprocessor({
      registrationAddress: FULL_ADDRESS_SITE
    })

    const { rows } = await diagnose(
      [organisation],
      [
        {
          registrationNumber: toRegistrationNumber(REPROCESSOR_NUMBER),
          year: toYear(2027),
          accreditationNumber: toAccreditationNumber('A27ER5001180999PL'),
          prnIssuance: { tonnageBand: 'up_to_500' },
          status: { current: 'approved', timeline: [] }
        }
      ]
    )

    expect(rows).toMatchObject([{ accreditations: 2, heldAccreditations: 2 }])
  })

  it('reports a full-address registration holding only a full address and no accreditation', async () => {
    const organisation = buildOrganisation({
      registrations: [
        reprocessor({
          site: { address: { fullAddress: '7 Glass processing site London' } }
        })
      ]
    })

    const { rows, summary } = await diagnose([organisation])

    expect(rows).toMatchObject([
      {
        finding: 'fullAddressOnly',
        hasLine1: false,
        hasTown: false,
        hasPostcode: false,
        accreditations: 0,
        heldAccreditations: 0
      }
    ])
    expect(summary).toMatchObject({
      fullAddressOnly: 1,
      fullOnlyHeld: 0
    })
  })

  it('compares the accreditation site of a registration the read model gives parts without a town', async () => {
    const organisation = accreditedReprocessor({
      registrationAddress: {
        line1: '7 Glass processing site',
        postcode: 'SW2A 0AA',
        fullAddress: '7 Glass processing site, Unit 4, Estate, London, SW2A 0AA'
      }
    })

    const { rows, summary } = await diagnose([organisation])

    expect(rows).toStrictEqual([])
    expect(summary).toMatchObject({
      fullAddressOnly: 0,
      checkedAccreditations: 1,
      matched: 1
    })
  })

  it('does not compare a stored accreditation whose year an external accreditation holds', async () => {
    const organisation = accreditedReprocessor({ accreditationSite: {} })

    const { rows, summary } = await diagnose(
      [organisation],
      [
        {
          registrationNumber: toRegistrationNumber(REPROCESSOR_NUMBER),
          year: toYear(2026),
          accreditationNumber: toAccreditationNumber('A26ER5001180999PL'),
          prnIssuance: { tonnageBand: 'up_to_500' },
          status: { current: 'approved', timeline: [] }
        }
      ]
    )

    expect(rows).toStrictEqual([])
    expect(summary).toMatchObject({
      checkedRegistrations: 1,
      checkedAccreditations: 0
    })
  })

  it('marks findings on a test organisation', async () => {
    const { rows } = await diagnose([
      accreditedReprocessor({
        accreditationSite: {},
        organisationNumber: toOrganisationNumber('999999')
      })
    ])

    expect(rows).toMatchObject([{ testOrganisation: true }])
  })

  it('checks neither exporters nor registrations and accreditations the read model does not serve', async () => {
    const unnumbered = accreditation({ accreditationNumber: undefined })
    const organisation = buildOrganisation({
      registrations: [
        exporter({ accreditationId: exporterAccreditation().id }),
        reprocessor({
          registrationNumber: 'R26ER5001180099PL',
          validFrom: undefined
        }),
        reprocessor({ accreditationId: unnumbered.id })
      ],
      accreditations: [unnumbered]
    })

    const { rows, summary } = await diagnose([organisation])

    expect(rows).toStrictEqual([])
    expect(summary).toMatchObject({
      checkedRegistrations: 1,
      checkedAccreditations: 0,
      matched: 0
    })
  })
})
