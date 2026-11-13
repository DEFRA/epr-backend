import { afterEach, beforeEach, describe, expect, vi } from 'vitest'

import { lastOpenDay } from '#common/helpers/dates/latest-open-year.js'
import { toYear } from '#common/helpers/dates/year.js'
import { toRegistrationNumber } from '#domain/organisations/numbers.js'
import { organisationYears } from '#organisation-read-model/domain/organisation-years.js'
import { buildExternalAccreditation } from '#organisation-read-model/repository/contract/test-data.js'
import { config } from '#root/config.js'
import {
  buildLinkedDefraOrg,
  createOrganisationBuilders
} from '#repositories/organisations/contract/test-data.js'
import {
  ACCREDITATION_NUMBER,
  EXPORTER_ACCREDITATION_NUMBER,
  EXPORTER_NUMBER,
  REPROCESSOR_NUMBER,
  accreditation,
  anakin,
  approvedOverseasSite,
  approvedTimeline,
  exporter,
  exporterAccreditation,
  findOrganisation,
  luke,
  overseasSites,
  pendingOverseasSite,
  reprocessor,
  reprocessorAt
} from './organisation-read-test-helpers.js'

const { buildOrganisation, nextOrganisationNumber } =
  createOrganisationBuilders()

/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { ExternalAccreditation } from '../to-read-model.js' */
/** @import { OrganisationReadRepositoryContractIt, OrganisationReadRepositoryWith } from '../port.contract.js' */

/**
 * @param {OrganisationReadRepositoryContractIt} it
 */
export const testFindByOrganisationNumberBehaviour = (it) => {
  describe('findByOrganisationNumber', () => {
    it('returns null for an unknown organisation number', async ({
      organisationReadRepositoryWith
    }) => {
      const repository = await organisationReadRepositoryWith({
        organisations: [buildOrganisation()]
      })

      expect(
        await repository.findByOrganisationNumber(nextOrganisationNumber())
      ).toBeNull()
    })

    it('returns the organisation with granted registrations keyed by number and accreditations by year', async ({
      organisationReadRepositoryWith
    }) => {
      const granted2026 = accreditation()
      const stored = buildOrganisation({
        registrations: [reprocessor({ accreditationId: granted2026.id })],
        accreditations: [granted2026]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(organisation).toEqual({
        organisationNumber: stored.organisationNumber,
        name: 'ACME ltd',
        tradingName: 'ACME ltd',
        companiesHouseNumber: 'AC012345',
        registeredAddress: {
          line1: 'Palace of Westminster',
          town: 'London',
          postcode: 'SW1A 0AA'
        },
        status: {
          current: 'created',
          timeline: [
            {
              status: 'created',
              at: new Date(stored.statusHistory[0].updatedAt).toISOString(),
              updatedAt: new Date(
                stored.statusHistory[0].updatedAt
              ).toISOString()
            }
          ]
        },
        submittedToRegulator: { code: 'ea' },
        submitterContactDetails: anakin,
        users: [],
        version: stored.version,
        registrations: {
          [REPROCESSOR_NUMBER]: {
            applicationContactDetails: luke,
            approvedPersons: [luke],
            status: {
              current: 'approved',
              timeline: approvedTimeline('2026-02-01')
            },
            submitterContactDetails: luke,
            validFrom: '2026-02-01',
            material: 'glass_re_melt',
            standingByDate: expect.objectContaining({
              2026: {
                '2026-02-01': { standing: 'registeredOnly' },
                '2026-07-01': { standing: 'accredited' }
              }
            }),
            submittedToRegulator: { code: 'ea' },
            wasteProcessingType: 'reprocessor',
            reprocessingType: 'input',
            site: {
              address: {
                line1: '7 Glass processing site',
                town: 'London',
                postcode: 'SW2A 0AA'
              }
            },
            accreditations: {
              2026: {
                accreditationNumber: ACCREDITATION_NUMBER,
                prnIssuance: { tonnageBand: 'over_10000' },
                status: {
                  current: 'approved',
                  timeline: approvedTimeline('2026-07-01')
                }
              }
            }
          }
        }
      })
    })

    it('gives an exporter the details of every overseas site it uses, and no site or reprocessing type', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({ registrations: [exporter()] })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        overseasSites
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(organisation.registrations[EXPORTER_NUMBER]).toEqual({
        applicationContactDetails: anakin,
        approvedPersons: [anakin],
        status: {
          current: 'approved',
          timeline: approvedTimeline('2026-02-01')
        },
        submitterContactDetails: anakin,
        validFrom: '2026-02-01',
        material: 'plastic',
        standingByDate: expect.objectContaining({
          2026: { '2026-02-01': { standing: 'registeredOnly' } }
        }),
        submittedToRegulator: { code: 'ea' },
        wasteProcessingType: 'exporter',
        overseasSites: {
          '001': approvedOverseasSite,
          '002': pendingOverseasSite
        },
        accreditations: {}
      })
    })

    it("records on an exporter's accreditation whether each overseas site is approved", async ({
      organisationReadRepositoryWith
    }) => {
      const accredited = exporterAccreditation()
      const stored = buildOrganisation({
        registrations: [exporter({ accreditationId: accredited.id })],
        accreditations: [accredited]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        overseasSites
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(
        organisation.registrations[EXPORTER_NUMBER].accreditations[2026]
      ).toMatchObject({
        accreditationNumber: EXPORTER_ACCREDITATION_NUMBER,
        overseasSites: {
          '001': { status: 'approved', approvedOn: '2026-01-01' },
          '002': { status: 'pending' }
        }
      })
    })

    it('keys an accreditation by the year of its validFrom', async ({
      organisationReadRepositoryWith
    }) => {
      const granted2025 = accreditation({
        validFrom: '2025-01-01',
        validTo: '2025-12-31'
      })
      const stored = buildOrganisation({
        registrations: [reprocessor({ accreditationId: granted2025.id })],
        accreditations: [granted2025]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(
        Object.keys(
          organisation.registrations[REPROCESSOR_NUMBER].accreditations
        )
      ).toEqual(['2025'])
    })

    describe('while next year is open', () => {
      beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-10') })
        config.set('openNextYear', true) // opens 2027
      })

      afterEach(() => {
        vi.useRealTimers()
        config.reset('openNextYear')
      })

      it('gives the accreditations of every year when no year is asked for', async ({
        organisationReadRepositoryWith
      }) => {
        const granted2026 = accreditation()
        const stored = buildOrganisation({
          registrations: [reprocessor({ accreditationId: granted2026.id })],
          accreditations: [granted2026]
        })
        const repository = await organisationReadRepositoryWith({
          organisations: [stored],
          externalAccreditations: [
            buildExternalAccreditation({
              registrationNumber: toRegistrationNumber(REPROCESSOR_NUMBER)
            })
          ]
        })

        const organisation = await findOrganisation(
          repository,
          stored.organisationNumber
        )

        expect(
          Object.keys(
            organisation.registrations[REPROCESSOR_NUMBER].accreditations
          )
        ).toEqual(['2026', '2027'])
      })
    })

    /**
     * @todo this belongs on the organisation and years routes, but no route
     * test reads through this repository yet, so it repeats the years
     * route's call. Move it there once route tests can.
     */
    describe('the years it serves accreditations for', () => {
      beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-10') })
      })

      afterEach(() => {
        vi.useRealTimers()
        config.reset('openNextYear')
      })

      it.for([
        { description: 'open', openNextYear: true },
        { description: 'closed', openNextYear: false }
      ])(
        'are all years the organisation is listed for, while next year is $description',
        async ({ openNextYear }, { organisationReadRepositoryWith }) => {
          config.set('openNextYear', openNextYear)
          const granted2026 = accreditation()
          const stored = buildOrganisation({
            registrations: [reprocessor({ accreditationId: granted2026.id })],
            accreditations: [granted2026]
          })
          const repository = await organisationReadRepositoryWith({
            organisations: [stored],
            externalAccreditations: [
              buildExternalAccreditation({
                registrationNumber: toRegistrationNumber(REPROCESSOR_NUMBER)
              })
            ]
          })

          const organisation = await findOrganisation(
            repository,
            stored.organisationNumber
          )
          const listed = organisationYears(organisation, lastOpenDay())
          const unlisted = Object.keys(
            organisation.registrations[REPROCESSOR_NUMBER].accreditations
          )
            .map(Number)
            .filter((year) => !listed.includes(toYear(year)))

          expect(unlisted).toStrictEqual([])
        }
      )
    })

    it('gives the site address parts without a town, and as submitted, when ingest could not find its town', async ({
      organisationReadRepositoryWith
    }) => {
      const fullAddress =
        '7 Glass site, Unit 4, Industrial Estate, London, SW2A 0AA'
      const stored = buildOrganisation({
        registrations: [
          reprocessorAt({
            line1: '7 Glass site',
            postcode: 'SW2A 0AA',
            fullAddress,
            country: 'UK',
            region: 'London'
          })
        ]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(organisation.registrations[REPROCESSOR_NUMBER]).toHaveProperty(
        'site',
        {
          address: {
            line1: '7 Glass site',
            postcode: 'SW2A 0AA',
            fullAddress,
            country: 'UK',
            region: 'London'
          }
        }
      )
    })

    it('gives only the site address as submitted when ingest could not split it', async ({
      organisationReadRepositoryWith
    }) => {
      const fullAddress = '7 Glass site SW2A 0AA'
      const stored = buildOrganisation({
        registrations: [reprocessorAt({ fullAddress, country: 'UK' })]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(organisation.registrations[REPROCESSOR_NUMBER]).toHaveProperty(
        'site',
        { address: { fullAddress, country: 'UK' } }
      )
    })

    it('gives an exporter with no overseas sites an empty map', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        registrations: [exporter({ overseasSites: undefined })]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(organisation.registrations[EXPORTER_NUMBER]).toHaveProperty(
        'overseasSites',
        {}
      )
    })

    it('leaves out the trading name, companies house number, registered address and organisation address when the organisation has none', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        registrations: [reprocessor()],
        companyDetails: { name: 'ACME ltd' }
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(organisation).not.toHaveProperty('tradingName')
      expect(organisation).not.toHaveProperty('companiesHouseNumber')
      expect(organisation).not.toHaveProperty('registeredAddress')
      expect(organisation).not.toHaveProperty('address')
    })

    it('gives the registered and organisation addresses with their country and region', async ({
      organisationReadRepositoryWith
    }) => {
      const registeredAddress = {
        line1: 'Palace of Westminster',
        town: 'London',
        postcode: 'SW1A 0AA',
        country: 'UK'
      }
      const address = {
        line1: '2 Depot Lane',
        town: 'Leeds',
        postcode: 'LS1 1AA',
        country: 'UK',
        region: 'Yorkshire'
      }
      const stored = buildOrganisation({
        registrations: [reprocessor()],
        companyDetails: { name: 'ACME ltd', registeredAddress, address }
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(organisation).toMatchObject({ registeredAddress, address })
    })

    it('gives a non-UK organisation address that has no postcode', async ({
      organisationReadRepositoryWith
    }) => {
      const address = {
        line1: '3 Rue de Rivoli',
        town: 'Paris',
        region: 'Île-de-France',
        country: 'France'
      }
      const stored = buildOrganisation({
        registrations: [reprocessor()],
        companyDetails: { name: 'ACME ltd', address }
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(organisation.address).toStrictEqual(address)
    })

    it('gives the registered address only as submitted, with its country, when ingest could not split it', async ({
      organisationReadRepositoryWith
    }) => {
      const registeredAddress = {
        fullAddress: 'Palace of Westminster SW1A 0AA',
        country: 'UK'
      }
      const stored = buildOrganisation({
        registrations: [reprocessor()],
        companyDetails: { name: 'ACME ltd', registeredAddress }
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(organisation.registeredAddress).toStrictEqual(registeredAddress)
    })

    it("lists the organisation's users with their names and roles", async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        registrations: [reprocessor()],
        users: [
          {
            contactId: 'contact-1',
            email: 'han@example.com',
            fullName: 'Han Solo',
            roles: ['initial_user']
          },
          {
            email: 'leia@example.com',
            fullName: 'Leia Organa',
            roles: ['standard_user']
          }
        ]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(organisation.users).toEqual([
        {
          contactId: 'contact-1',
          email: 'han@example.com',
          fullName: 'Han Solo',
          roles: ['initial_user']
        },
        {
          email: 'leia@example.com',
          fullName: 'Leia Organa',
          roles: ['standard_user']
        }
      ])
    })

    it('groups the linked Defra ID organisation apart from who linked it and when', async ({
      organisationReadRepositoryWith
    }) => {
      const linked = buildLinkedDefraOrg('defra-org-1', 'Defra Org')
      const stored = buildOrganisation({
        registrations: [reprocessor()],
        linkedDefraOrganisation: linked
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(organisation.linkedDefraOrganisation).toEqual({
        defraOrganisation: { id: 'defra-org-1', name: 'Defra Org' },
        linkedAt: linked.linkedAt,
        linkedBy: linked.linkedBy
      })
    })

    it('gives the time the organisation was linked as an ISO date-time when it is stored as a date', async ({
      organisationReadRepositoryWith
    }) => {
      const linked = buildLinkedDefraOrg('defra-org-1', 'Defra Org')
      const stored = buildOrganisation({
        registrations: [reprocessor()],
        linkedDefraOrganisation: {
          ...linked,
          linkedAt: new Date('2026-03-04T05:06:07.000Z')
        }
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(organisation.linkedDefraOrganisation?.linkedAt).toBe(
        '2026-03-04T05:06:07.000Z'
      )
    })

    it('leaves out a contact phone number that was never given', async ({
      organisationReadRepositoryWith
    }) => {
      const { phone: _phone, ...withoutPhone } = luke
      const stored = buildOrganisation({
        registrations: [
          reprocessor({ applicationContactDetails: withoutPhone })
        ]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored]
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(
        organisation.registrations[REPROCESSOR_NUMBER].applicationContactDetails
      ).toEqual(withoutPhone)
    })
  })

  describe('findByOrganisationNumber for years', () => {
    beforeEach(() => {
      vi.useFakeTimers({
        toFake: ['Date'],
        now: new Date('2027-03-15T10:00:00.000Z')
      })
    })

    afterEach(() => {
      vi.useRealTimers()
      config.reset('openNextYear')
    })

    /**
     * A status history recorded at the start of each day given.
     * @param {[string, string][]} changes - status and day
     */
    const history = (changes) =>
      changes.map(([status, day]) => ({
        status,
        updatedAt: `${day}T00:00:00.000Z`
      }))

    /**
     * A reprocessor approved from `validFrom`, with any later changes.
     * @param {string} validFrom
     * @param {[string, string][]} [changes]
     * @param {object} [overrides]
     */
    const reprocessorFrom = (validFrom, changes = [], overrides = {}) =>
      reprocessor({
        validFrom,
        statusHistory: history([
          ['created', '2024-01-01'],
          ['approved', validFrom],
          ...changes
        ]),
        ...overrides
      })

    /**
     * @param {OrganisationReadRepositoryWith} organisationReadRepositoryWith
     * @param {ReturnType<typeof buildOrganisation>} storedOrganisation
     * @param {number} year
     * @param {ExternalAccreditation[]} [externalAccreditations]
     * @returns {Promise<Organisation>}
     */
    const findInYear = async (
      organisationReadRepositoryWith,
      storedOrganisation,
      year,
      externalAccreditations = []
    ) => {
      const repository = await organisationReadRepositoryWith({
        organisations: [storedOrganisation],
        externalAccreditations
      })
      const organisation = await repository.findByOrganisationNumber(
        storedOrganisation.organisationNumber,
        { year: toYear(year) }
      )
      expect(organisation).not.toBeNull()
      return /** @type {Organisation} */ (organisation)
    }

    const external2027 = () =>
      buildExternalAccreditation({
        registrationNumber: toRegistrationNumber(REPROCESSOR_NUMBER)
      })

    it('keeps a registration approved in the year with only that year’s accreditation', async ({
      organisationReadRepositoryWith
    }) => {
      const granted2026 = accreditation()
      const stored = buildOrganisation({
        registrations: [
          reprocessorFrom('2025-02-01', [], {
            accreditationId: granted2026.id
          })
        ],
        accreditations: [granted2026]
      })

      const { registrations } = await findInYear(
        organisationReadRepositoryWith,
        stored,
        2026,
        [external2027()]
      )

      expect(
        Object.keys(registrations[REPROCESSOR_NUMBER].accreditations)
      ).toEqual(['2026'])
    })

    it('keeps only that year’s status dates', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        registrations: [reprocessorFrom('2025-02-01')]
      })

      const { registrations } = await findInYear(
        organisationReadRepositoryWith,
        stored,
        2026
      )

      expect(registrations[REPROCESSOR_NUMBER].standingByDate).toStrictEqual({
        2026: { '2026-01-01': { standing: 'registeredOnly' } }
      })
    })

    it('serves no accreditations when the year has none', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        registrations: [reprocessorFrom('2025-02-01')]
      })

      const { registrations } = await findInYear(
        organisationReadRepositoryWith,
        stored,
        2026,
        [external2027()]
      )

      expect(registrations[REPROCESSOR_NUMBER].accreditations).toStrictEqual({})
    })

    it('drops a registration cancelled before the year starts', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        registrations: [
          reprocessorFrom('2024-02-01', [['cancelled', '2025-06-01']])
        ]
      })

      const { registrations } = await findInYear(
        organisationReadRepositoryWith,
        stored,
        2026
      )

      expect(registrations).toStrictEqual({})
    })

    it('drops a registration approved after the year', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        registrations: [reprocessorFrom('2027-01-10')]
      })

      const { registrations } = await findInYear(
        organisationReadRepositoryWith,
        stored,
        2026
      )

      expect(registrations).toStrictEqual({})
    })

    it('serves a registration cancelled part-way through the year as cancelled', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        registrations: [
          reprocessorFrom('2025-02-01', [['cancelled', '2026-03-01']])
        ]
      })

      const { registrations } = await findInYear(
        organisationReadRepositoryWith,
        stored,
        2026
      )

      expect(registrations[REPROCESSOR_NUMBER].status.current).toBe('cancelled')
    })

    it('serves a past year’s statuses as they stood on 31 December', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        statusHistory: history([
          ['created', '2024-01-01'],
          ['approved', '2025-01-01'],
          ['active', '2026-06-01']
        ]),
        registrations: [
          reprocessorFrom('2025-02-01', [['cancelled', '2026-03-01']])
        ]
      })

      const organisation = await findInYear(
        organisationReadRepositoryWith,
        stored,
        2025
      )

      expect([
        organisation.status.current,
        organisation.registrations[REPROCESSOR_NUMBER].status.current
      ]).toStrictEqual(['approved', 'approved'])
    })

    it('serves the current year’s statuses as they stand today', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        statusHistory: history([
          ['approved', '2025-01-01'],
          ['active', '2027-01-01'],
          ['rejected', '2027-12-01']
        ]),
        registrations: [reprocessorFrom('2025-02-01')]
      })

      const { status } = await findInYear(
        organisationReadRepositoryWith,
        stored,
        2027
      )

      expect(status.current).toBe('active')
    })

    it('serves a registration with a change still to come as it stands today', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        registrations: [
          reprocessorFrom('2027-01-10', [['cancelled', '2027-11-01']])
        ]
      })

      const { registrations } = await findInYear(
        organisationReadRepositoryWith,
        stored,
        2027
      )

      expect(registrations[REPROCESSOR_NUMBER].status.current).toBe('approved')
    })

    it('serves a registration approved later in the year with its current status, as it has none yet today', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        registrations: [reprocessorFrom('2027-06-01')]
      })

      const { registrations } = await findInYear(
        organisationReadRepositoryWith,
        stored,
        2027
      )

      expect(registrations[REPROCESSOR_NUMBER].status.current).toBe('approved')
    })

    it('serves the last status on a year’s final day when it changed several times that day', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        statusHistory: [
          { status: 'approved', updatedAt: '2025-01-01T09:00:00.000Z' },
          { status: 'rejected', updatedAt: '2025-12-31T09:00:00.000Z' },
          { status: 'active', updatedAt: '2025-12-31T15:00:00.000Z' }
        ],
        registrations: [reprocessorFrom('2025-02-01')]
      })

      const { status } = await findInYear(
        organisationReadRepositoryWith,
        stored,
        2025
      )

      expect(status.current).toBe('active')
    })

    it('keeps the current organisation status when its timeline starts later', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        statusHistory: history([['active', '2026-06-01']]),
        registrations: [reprocessorFrom('2025-02-01')]
      })

      const { status } = await findInYear(
        organisationReadRepositoryWith,
        stored,
        2025
      )

      expect(status.current).toBe('active')
    })

    it('serves a registration in a year not yet started, with its standing based on the status today', async ({
      organisationReadRepositoryWith
    }) => {
      vi.setSystemTime(new Date('2026-06-15T10:00:00.000Z'))
      config.set('openNextYear', true) // opens 2027

      const stored = buildOrganisation({
        registrations: [reprocessorFrom('2025-02-01')]
      })

      const { registrations } = await findInYear(
        organisationReadRepositoryWith,
        stored,
        2027
      )

      expect(registrations[REPROCESSOR_NUMBER].status.current).toBe('approved')
      expect(registrations[REPROCESSOR_NUMBER].standingByDate).toStrictEqual({
        2027: { '2027-01-01': { standing: 'registeredOnly' } }
      })
    })

    it('leaves the other organisation fields unchanged', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        registrations: [reprocessorFrom('2025-02-01')]
      })

      const { name } = await findInYear(
        organisationReadRepositoryWith,
        stored,
        2026
      )

      expect(name).toBe('ACME ltd')
    })
  })
}
