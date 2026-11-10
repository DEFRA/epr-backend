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
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { partialMock } from '#test/type-helpers.js'

import { diagnosePrnSiteAddresses } from './diagnose-prn-site-addresses.js'

/** @import { ExternalAccreditation } from '#organisation-read-model/repository/to-read-model.js' */

const { buildOrganisation } = createOrganisationBuilders()

const TODAY = '2026-11-10'

const REGISTRATION_SITE = {
  line1: '7 Glass processing site',
  town: 'London',
  postcode: 'SW2A 0AA'
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
 *   orgId?: number
 * }} [options]
 */
const accreditedReprocessor = ({
  registrationAddress = REGISTRATION_SITE,
  accreditationSite = {
    address: { line1: '7 Glass processing site', postcode: 'SW2A 0AA' }
  },
  orgId
} = {}) => {
  const held = accreditation({ site: accreditationSite })
  const registration = reprocessor({ accreditationId: held.id })
  return buildOrganisation({
    ...(orgId && { orgId }),
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
          orgId: organisation.orgId,
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
        orgId: organisation.orgId,
        testOrganisation: false,
        registrationNumber: REPROCESSOR_NUMBER,
        accreditationNumber: ACCREDITATION_NUMBER,
        year: '2026',
        status: 'approved'
      }
    ])
    expect(summary).toMatchObject({ matched: 0, noAccreditationSite: 1 })
  })

  it('reports a registration whose site the read model holds only as a full address, without comparing its accreditations', async () => {
    const organisation = accreditedReprocessor({
      registrationAddress: {
        line1: '7',
        postcode: 'SW2A 0AA',
        fullAddress: '7 Glass processing site London SW2A 0AA'
      }
    })

    const { rows, summary } = await diagnose([organisation])

    expect(rows).toStrictEqual([
      {
        finding: 'fullAddressOnly',
        orgId: organisation.orgId,
        testOrganisation: false,
        registrationNumber: REPROCESSOR_NUMBER
      }
    ])
    expect(summary).toMatchObject({
      checkedRegistrations: 1,
      fullAddressOnly: 1,
      checkedAccreditations: 0
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
      accreditedReprocessor({ accreditationSite: {}, orgId: 999999 })
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
