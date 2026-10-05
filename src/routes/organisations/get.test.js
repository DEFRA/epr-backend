import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'

import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import {
  buildAccreditation,
  buildLinkedDefraOrg,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import {
  asOperator,
  asServiceMaintainer,
  asUnscopedAdminUser
} from '#test/inject-auth.js'
import { partialMock } from '#test/type-helpers.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { testRegulatorCanRead } from '#vite/helpers/test-invalid-roles-scenarios.js'

const REPROCESSOR_NUMBER = 'R26ER5001180041PL'
const EXPORTER_NUMBER = 'R26EX5001180042PL'
const ACCREDITATION_NUMBER = 'A26ER5001180114PL'
const EXPORTER_ACCREDITATION_NUMBER = 'A26EX5001180115PL'

const APPROVED_SITE_ID = new ObjectId().toString()
const PENDING_SITE_ID = new ObjectId().toString()
const MISSING_SITE_ID = new ObjectId().toString()

const approvedSite = {
  id: APPROVED_SITE_ID,
  name: 'Beta Reprocessor',
  country: 'Germany',
  address: { line1: '2 Teststrasse', townOrCity: 'Berlin', postcode: '10115' },
  coordinates: '52.5200,13.4050',
  validFrom: new Date('2026-01-01T00:00:00.000Z'),
  createdAt: new Date(),
  updatedAt: new Date()
}

const pendingSite = {
  id: PENDING_SITE_ID,
  name: 'Alpha Reprocessor',
  country: 'France',
  address: { line1: '1 Rue de Test', townOrCity: 'Paris', line2: null },
  createdAt: new Date(),
  updatedAt: new Date()
}

const granted = (status) => [
  { status: 'created', updatedAt: '2026-01-01' },
  { status, updatedAt: '2026-02-01' }
]

const accreditation = (overrides = {}) =>
  buildAccreditation({
    accreditationNumber: ACCREDITATION_NUMBER,
    validFrom: '2026-07-01',
    validTo: '2026-12-31',
    statusHistory: granted('approved'),
    ...overrides
  })

const exporterAccreditation = (overrides = {}) =>
  accreditation({
    wasteProcessingType: 'exporter',
    accreditationNumber: EXPORTER_ACCREDITATION_NUMBER,
    ...overrides
  })

const reprocessor = (overrides = {}) =>
  buildRegistration({
    registrationNumber: REPROCESSOR_NUMBER,
    reprocessingType: 'input',
    validFrom: '2026-02-01',
    statusHistory: granted('approved'),
    ...overrides
  })

const exporter = (overrides = {}) =>
  buildRegistration({
    wasteProcessingType: 'exporter',
    registrationNumber: EXPORTER_NUMBER,
    validFrom: '2026-02-01',
    statusHistory: granted('approved'),
    overseasSites: {
      '001': { overseasSiteId: APPROVED_SITE_ID },
      '002': { overseasSiteId: PENDING_SITE_ID }
    },
    ...overrides
  })

const reprocessorAt = (address) => {
  const registration = reprocessor()
  return { ...registration, site: { ...registration.site, address } }
}

const approvedSiteView = {
  name: 'Beta Reprocessor',
  address: {
    line1: '2 Teststrasse',
    townOrCity: 'Berlin',
    postcode: '10115',
    country: 'Germany'
  },
  coordinates: '52.5200,13.4050'
}

const pendingSiteView = {
  name: 'Alpha Reprocessor',
  address: { line1: '1 Rue de Test', townOrCity: 'Paris', country: 'France' }
}

describe('organisation view routes', () => {
  setupAuthContext()

  let server

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  /**
   * @param {object} organisation
   */
  const serve = async (organisation) => {
    server = await createTestServer({
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository([
          partialMock(organisation)
        ]),
        overseasSitesRepository: createInMemoryOverseasSitesRepository([
          approvedSite,
          pendingSite
        ])
      }
    })
  }

  /**
   * @param {string} url
   * @param {object} [auth]
   */
  const get = (url, auth = asServiceMaintainer()) =>
    server.inject({ method: 'GET', url, ...auth })

  const body = (response) => JSON.parse(response.payload)

  /**
   * @param {{ orgId: number }} organisation
   */
  const registrationsOf = async (organisation) => {
    await serve(organisation)
    return body(await get(`/organisations/${organisation.orgId}`)).registrations
  }

  describe('GET /organisations/{organisationNumber}', () => {
    it('returns the organisation with granted registrations keyed by number and accreditations by year', async () => {
      const granted2026 = accreditation()
      const organisation = buildOrganisation({
        registrations: [reprocessor({ accreditationId: granted2026.id })],
        accreditations: [granted2026]
      })
      await serve(organisation)

      const response = await get(`/organisations/${organisation.orgId}`)

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(body(response)).toEqual({
        organisationNumber: organisation.orgId,
        name: 'ACME ltd',
        tradingName: 'ACME ltd',
        status: 'created',
        submittedToRegulator: { code: 'ea' },
        registrations: {
          [REPROCESSOR_NUMBER]: {
            status: 'approved',
            validFrom: '2026-02-01',
            material: 'glass_re_melt',
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
                status: 'approved'
              }
            }
          }
        }
      })
    })

    it('gives an exporter the details of every overseas site it uses, and no site or reprocessing type', async () => {
      const registrations = await registrationsOf(
        buildOrganisation({ registrations: [exporter()] })
      )

      expect(registrations[EXPORTER_NUMBER]).toEqual({
        status: 'approved',
        validFrom: '2026-02-01',
        material: 'plastic',
        submittedToRegulator: { code: 'ea' },
        wasteProcessingType: 'exporter',
        overseasSites: { '001': approvedSiteView, '002': pendingSiteView },
        accreditations: {}
      })
    })

    it("records on an exporter's accreditation whether each overseas site is approved", async () => {
      const accredited = exporterAccreditation()
      const registrations = await registrationsOf(
        buildOrganisation({
          registrations: [exporter({ accreditationId: accredited.id })],
          accreditations: [accredited]
        })
      )

      expect(registrations[EXPORTER_NUMBER].accreditations[2026]).toEqual({
        accreditationNumber: EXPORTER_ACCREDITATION_NUMBER,
        status: 'approved',
        overseasSites: {
          '001': { status: 'approved', approvedOn: '2026-01-01' },
          '002': { status: 'pending' }
        }
      })
    })

    it('keys an accreditation by the year of its validFrom', async () => {
      const granted2027 = accreditation({
        validFrom: '2027-01-01',
        validTo: '2027-12-31'
      })
      const registrations = await registrationsOf(
        buildOrganisation({
          registrations: [reprocessor({ accreditationId: granted2027.id })],
          accreditations: [granted2027]
        })
      )

      expect(
        Object.keys(registrations[REPROCESSOR_NUMBER].accreditations)
      ).toEqual(['2027'])
    })

    it('serves the site address as submitted when ingest could not find its town', async () => {
      const fullAddress =
        '7 Glass site, Unit 4, Industrial Estate, London, SW2A 0AA'
      const registrations = await registrationsOf(
        buildOrganisation({
          registrations: [
            reprocessorAt({
              line1: '7 Glass site',
              postcode: 'SW2A 0AA',
              fullAddress,
              country: 'UK'
            })
          ]
        })
      )

      expect(registrations[REPROCESSOR_NUMBER].site).toEqual({
        address: { fullAddress }
      })
    })

    it('gives an exporter with no overseas sites an empty map', async () => {
      const registrations = await registrationsOf(
        buildOrganisation({
          registrations: [exporter({ overseasSites: undefined })]
        })
      )

      expect(registrations[EXPORTER_NUMBER].overseasSites).toEqual({})
    })

    it('leaves out the trading name when the organisation has none', async () => {
      const base = buildOrganisation({ registrations: [reprocessor()] })
      await serve({ ...base, companyDetails: { name: 'ACME ltd' } })

      const response = await get(`/organisations/${base.orgId}`)

      expect(body(response)).not.toHaveProperty('tradingName')
    })

    it('groups the linked Defra ID organisation apart from who linked it and when', async () => {
      const linked = buildLinkedDefraOrg('defra-org-1', 'Defra Org')
      const organisation = buildOrganisation({
        registrations: [reprocessor()],
        linkedDefraOrganisation: linked
      })
      await serve(organisation)

      const response = await get(`/organisations/${organisation.orgId}`)

      expect(body(response).linkedDefraOrganisation).toEqual({
        defraOrganisation: { id: 'defra-org-1', name: 'Defra Org' },
        linkedAt: linked.linkedAt,
        linkedBy: { email: 'linker@example.com' }
      })
    })

    describe('records it cannot serve', () => {
      it('leaves out a registration without a number', async () => {
        const registrations = await registrationsOf(
          buildOrganisation({
            registrations: [
              reprocessor(),
              exporter({ registrationNumber: null })
            ]
          })
        )

        expect(Object.keys(registrations)).toEqual([REPROCESSOR_NUMBER])
      })

      it('leaves out a registration without validFrom', async () => {
        const registrations = await registrationsOf(
          buildOrganisation({
            registrations: [reprocessor({ validFrom: null })]
          })
        )

        expect(registrations).toEqual({})
      })

      it('leaves out a numbered registration that is not approved or cancelled', async () => {
        const registrations = await registrationsOf(
          buildOrganisation({
            registrations: [
              reprocessor(),
              exporter({ statusHistory: granted('rejected') })
            ]
          })
        )

        expect(Object.keys(registrations)).toEqual([REPROCESSOR_NUMBER])
      })

      it('leaves out a reprocessor without a reprocessing type', async () => {
        const registrations = await registrationsOf(
          buildOrganisation({
            registrations: [reprocessor({ reprocessingType: null })]
          })
        )

        expect(registrations).toEqual({})
      })

      it('leaves out a reprocessor whose site address has neither its parts nor the submitted address', async () => {
        const registrations = await registrationsOf(
          buildOrganisation({
            registrations: [reprocessorAt({ line1: '7 Glass site' })]
          })
        )

        expect(registrations).toEqual({})
      })

      it('leaves out every registration that shares its number with another', async () => {
        const registrations = await registrationsOf(
          buildOrganisation({
            registrations: [reprocessor(), reprocessor(), exporter()]
          })
        )

        expect(Object.keys(registrations)).toEqual([EXPORTER_NUMBER])
      })

      it('leaves out an accreditation without a number', async () => {
        const ungranted = buildAccreditation()
        const registrations = await registrationsOf(
          buildOrganisation({
            registrations: [reprocessor({ accreditationId: ungranted.id })],
            accreditations: [ungranted]
          })
        )

        expect(registrations[REPROCESSOR_NUMBER].accreditations).toEqual({})
      })

      it('leaves out a numbered accreditation that is not approved, suspended or cancelled', async () => {
        const rejected = accreditation({ statusHistory: granted('rejected') })
        const registrations = await registrationsOf(
          buildOrganisation({
            registrations: [reprocessor({ accreditationId: rejected.id })],
            accreditations: [rejected]
          })
        )

        expect(registrations[REPROCESSOR_NUMBER].accreditations).toEqual({})
      })

      it('leaves out an accreditation without validFrom', async () => {
        const undated = accreditation({ validFrom: undefined })
        const registrations = await registrationsOf(
          buildOrganisation({
            registrations: [reprocessor({ accreditationId: undated.id })],
            accreditations: [undated]
          })
        )

        expect(registrations[REPROCESSOR_NUMBER].accreditations).toEqual({})
      })

      it('leaves out an overseas site whose site record no longer exists', async () => {
        const registrations = await registrationsOf(
          buildOrganisation({
            registrations: [
              exporter({
                overseasSites: {
                  '001': { overseasSiteId: APPROVED_SITE_ID },
                  '003': { overseasSiteId: MISSING_SITE_ID }
                }
              })
            ]
          })
        )

        expect(
          Object.keys(registrations[EXPORTER_NUMBER].overseasSites)
        ).toEqual(['001'])
      })
    })

    it('returns 404 for an unknown organisation number', async () => {
      await serve(buildOrganisation({ orgId: 500001 }))

      const response = await get('/organisations/500002')

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('rejects an organisation number that is not a number', async () => {
      await serve(buildOrganisation())

      const response = await get('/organisations/not-a-number')

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    describe('authorisation', () => {
      const organisation = buildOrganisation({
        registrations: [reprocessor()]
      })
      const request = async () => {
        await serve(organisation)
        return { method: 'GET', url: `/organisations/${organisation.orgId}` }
      }

      it('shows an operator their own organisation', async () => {
        const { url } = await request()

        const response = await get(url, asOperator())

        expect(response.statusCode).toBe(StatusCodes.OK)
      })

      it('refuses a caller who holds no organisation read', async () => {
        const { url } = await request()

        const response = await get(url, asUnscopedAdminUser())

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      })

      testRegulatorCanRead({ server: () => server, makeRequest: request })
    })
  })

  describe('sub-resources', () => {
    const reprocessorAccreditation = accreditation()
    const exportAccreditation = exporterAccreditation()
    const organisation = buildOrganisation({
      registrations: [
        reprocessor({ accreditationId: reprocessorAccreditation.id }),
        exporter({ accreditationId: exportAccreditation.id })
      ],
      accreditations: [reprocessorAccreditation, exportAccreditation]
    })
    const registrations = `/organisations/${organisation.orgId}/registrations`
    const reprocessorPath = `${registrations}/${REPROCESSOR_NUMBER}`
    const exporterPath = `${registrations}/${EXPORTER_NUMBER}`

    beforeEach(async () => {
      await serve(organisation)
    })

    it.each([
      ['an unknown registration', `${registrations}/R26XX0000000000PL`],
      [
        'an unknown accreditation year',
        `${reprocessorPath}/accreditations/2027`
      ],
      ['an unknown overseas site', `${exporterPath}/overseas-sites/099`],
      [
        'an unknown accredited overseas site',
        `${exporterPath}/accreditations/2026/overseas-sites/099`
      ],
      ["a reprocessor's overseas sites", `${reprocessorPath}/overseas-sites`],
      [
        "a reprocessor accreditation's overseas sites",
        `${reprocessorPath}/accreditations/2026/overseas-sites`
      ]
    ])('returns 404 for %s', async (_, url) => {
      const response = await get(url)

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('lists the granted registrations keyed by number', async () => {
      const response = await get(registrations)

      expect(Object.keys(body(response).registrations)).toEqual([
        REPROCESSOR_NUMBER,
        EXPORTER_NUMBER
      ])
    })

    it('returns one registration by its number', async () => {
      const response = await get(exporterPath)

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(body(response)).toMatchObject({
        wasteProcessingType: 'exporter',
        overseasSites: { '001': approvedSiteView }
      })
    })

    it("returns a registration's overseas sites", async () => {
      const response = await get(`${exporterPath}/overseas-sites`)

      expect(body(response)).toEqual({
        overseasSites: { '001': approvedSiteView, '002': pendingSiteView }
      })
    })

    it('returns one overseas site by its ORS id', async () => {
      const response = await get(`${exporterPath}/overseas-sites/002`)

      expect(body(response)).toEqual(pendingSiteView)
    })

    it("returns a registration's accreditations keyed by year", async () => {
      const response = await get(`${reprocessorPath}/accreditations`)

      expect(body(response)).toEqual({
        accreditations: {
          2026: {
            accreditationNumber: ACCREDITATION_NUMBER,
            status: 'approved'
          }
        }
      })
    })

    it('returns one accreditation by its year', async () => {
      const response = await get(`${exporterPath}/accreditations/2026`)

      expect(body(response)).toMatchObject({
        accreditationNumber: EXPORTER_ACCREDITATION_NUMBER
      })
    })

    it("returns an accreditation's overseas sites", async () => {
      const response = await get(
        `${exporterPath}/accreditations/2026/overseas-sites`
      )

      expect(body(response)).toEqual({
        overseasSites: {
          '001': { status: 'approved', approvedOn: '2026-01-01' },
          '002': { status: 'pending' }
        }
      })
    })

    it('returns one accredited overseas site by its ORS id', async () => {
      const response = await get(
        `${exporterPath}/accreditations/2026/overseas-sites/001`
      )

      expect(body(response)).toEqual({
        status: 'approved',
        approvedOn: '2026-01-01'
      })
    })
  })
})
