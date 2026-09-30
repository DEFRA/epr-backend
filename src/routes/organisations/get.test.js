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

const REGISTRATION_NUMBER = 'R26ER5001180041PL'
const EXPORTER_REGISTRATION_NUMBER = 'R26EX5001180042PL'

const APPROVED_SITE_ID = new ObjectId().toString()
const UNAPPROVED_SITE_ID = new ObjectId().toString()

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

const unapprovedSite = {
  id: UNAPPROVED_SITE_ID,
  name: 'Alpha Reprocessor',
  country: 'France',
  address: { line1: '1 Rue de Test', townOrCity: 'Paris' },
  createdAt: new Date(),
  updatedAt: new Date()
}

const approvedAccreditation = (overrides = {}) =>
  buildAccreditation({
    accreditationNumber: 'A26ER5001180114PL',
    validFrom: '2026-07-01',
    validTo: '2026-12-31',
    statusHistory: [
      { status: 'created', updatedAt: '2026-01-01' },
      { status: 'approved', updatedAt: '2026-02-01' }
    ],
    ...overrides
  })

const reprocessor = (overrides = {}) =>
  buildRegistration({
    registrationNumber: REGISTRATION_NUMBER,
    reprocessingType: 'input',
    ...overrides
  })

const exporter = () =>
  buildRegistration({
    wasteProcessingType: 'exporter',
    registrationNumber: EXPORTER_REGISTRATION_NUMBER,
    overseasSites: {
      '001': { overseasSiteId: APPROVED_SITE_ID },
      '002': { overseasSiteId: UNAPPROVED_SITE_ID }
    }
  })

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
          unapprovedSite
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

  describe('GET /organisations/{organisationNumber}', () => {
    it('returns only the fields the frontends use, with accreditations keyed by year', async () => {
      const accreditation = approvedAccreditation()
      const registration = reprocessor({ accreditationId: accreditation.id })
      const organisation = buildOrganisation({
        registrations: [registration],
        accreditations: [accreditation]
      })
      await serve(organisation)

      const response = await get(`/organisations/${organisation.orgId}`)

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(body(response)).toEqual({
        id: organisation.id,
        orgId: organisation.orgId,
        name: 'ACME ltd',
        tradingName: 'ACME ltd',
        status: 'created',
        submittedToRegulator: 'ea',
        registrations: [
          {
            id: registration.id,
            registrationNumber: REGISTRATION_NUMBER,
            status: 'created',
            validFrom: null,
            material: 'glass_re_melt',
            wasteProcessingType: 'reprocessor',
            reprocessingType: 'input',
            submittedToRegulator: 'ea',
            site: {
              address: {
                line1: '7 Glass processing site',
                town: 'London',
                postcode: 'SW2A 0AA'
              }
            },
            overseasSites: {},
            accreditations: {
              2026: {
                id: accreditation.id,
                accreditationNumber: 'A26ER5001180114PL',
                status: 'approved'
              }
            }
          }
        ]
      })
    })

    it('gives an exporter no site and its overseas sites keyed by ORS id', async () => {
      const organisation = buildOrganisation({ registrations: [exporter()] })
      await serve(organisation)

      const [registration] = body(
        await get(`/organisations/${organisation.orgId}`)
      ).registrations

      expect(registration.site).toBeNull()
      expect(registration.overseasSites).toEqual({
        '001': {
          name: 'Beta Reprocessor',
          country: 'Germany',
          address: {
            line1: '2 Teststrasse',
            townOrCity: 'Berlin',
            postcode: '10115'
          },
          coordinates: '52.5200,13.4050',
          validFrom: '2026-01-01T00:00:00.000Z'
        },
        '002': {
          name: 'Alpha Reprocessor',
          country: 'France',
          address: { line1: '1 Rue de Test', townOrCity: 'Paris' },
          coordinates: null,
          validFrom: null
        }
      })
    })

    it('keys an accreditation by the year of its validFrom', async () => {
      const accreditation = approvedAccreditation({
        validFrom: '2027-01-01',
        validTo: '2027-12-31'
      })
      const organisation = buildOrganisation({
        registrations: [reprocessor({ accreditationId: accreditation.id })],
        accreditations: [accreditation]
      })
      await serve(organisation)

      const [registration] = body(
        await get(`/organisations/${organisation.orgId}`)
      ).registrations

      expect(Object.keys(registration.accreditations)).toEqual(['2027'])
    })

    it('keys an accreditation not yet granted by the 2026 scheme year', async () => {
      const accreditation = buildAccreditation()
      const organisation = buildOrganisation({
        registrations: [reprocessor({ accreditationId: accreditation.id })],
        accreditations: [accreditation]
      })
      await serve(organisation)

      const [registration] = body(
        await get(`/organisations/${organisation.orgId}`)
      ).registrations

      expect(registration.accreditations).toEqual({
        2026: {
          id: accreditation.id,
          accreditationNumber: null,
          status: 'created'
        }
      })
    })

    it('gives a registration without an accreditation an empty map', async () => {
      const organisation = buildOrganisation({ registrations: [reprocessor()] })
      await serve(organisation)

      const [registration] = body(
        await get(`/organisations/${organisation.orgId}`)
      ).registrations

      expect(registration.accreditations).toEqual({})
    })

    it('includes the linked Defra organisation, with only the linker email', async () => {
      const linked = buildLinkedDefraOrg('defra-org-1', 'Defra Org')
      const organisation = buildOrganisation({
        registrations: [reprocessor()],
        linkedDefraOrganisation: linked
      })
      await serve(organisation)

      const response = await get(`/organisations/${organisation.orgId}`)

      expect(body(response).linkedDefraOrganisation).toEqual({
        orgId: 'defra-org-1',
        orgName: 'Defra Org',
        linkedAt: linked.linkedAt,
        linkedBy: { email: 'linker@example.com' }
      })
    })

    it('returns 404 for an unknown organisation number', async () => {
      await serve(buildOrganisation({ orgId: 500001 }))

      const response = await get('/organisations/500002')

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 400 for an organisation number that is not a number', async () => {
      await serve(buildOrganisation())

      const response = await get('/organisations/not-a-number')

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
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

  describe('registration sub-resources', () => {
    const accreditation = approvedAccreditation()
    const organisation = buildOrganisation({
      registrations: [
        reprocessor({ accreditationId: accreditation.id }),
        exporter()
      ],
      accreditations: [accreditation]
    })
    const base = `/organisations/${organisation.orgId}/registrations`

    beforeEach(async () => {
      await serve(organisation)
    })

    it('lists every registration in the organisation view shape', async () => {
      const response = await get(base)

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(
        body(response).registrations.map((r) => r.registrationNumber)
      ).toEqual([REGISTRATION_NUMBER, EXPORTER_REGISTRATION_NUMBER])
    })

    it('returns one registration by its registration number', async () => {
      const response = await get(`${base}/${EXPORTER_REGISTRATION_NUMBER}`)

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(body(response)).toMatchObject({
        registrationNumber: EXPORTER_REGISTRATION_NUMBER,
        site: null,
        overseasSites: { '001': { name: 'Beta Reprocessor' } }
      })
    })

    it('returns 404 for an unknown registration number', async () => {
      const response = await get(`${base}/R26XX0000000000PL`)

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns the registration accreditations keyed by year', async () => {
      const response = await get(
        `${base}/${REGISTRATION_NUMBER}/accreditations`
      )

      expect(body(response)).toEqual({
        accreditations: {
          2026: {
            id: accreditation.id,
            accreditationNumber: 'A26ER5001180114PL',
            status: 'approved'
          }
        }
      })
    })

    it('returns one accreditation by its year', async () => {
      const response = await get(
        `${base}/${REGISTRATION_NUMBER}/accreditations/2026`
      )

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(body(response).id).toBe(accreditation.id)
    })

    it('returns 404 for a year the registration holds no accreditation for', async () => {
      const response = await get(
        `${base}/${REGISTRATION_NUMBER}/accreditations/2027`
      )

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns the registration overseas sites keyed by ORS id', async () => {
      const response = await get(
        `${base}/${EXPORTER_REGISTRATION_NUMBER}/overseas-sites`
      )

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(Object.keys(body(response).overseasSites)).toEqual(['001', '002'])
    })
  })
})
