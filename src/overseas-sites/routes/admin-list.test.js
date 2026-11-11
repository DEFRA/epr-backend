import { StatusCodes } from 'http-status-codes'
import Boom from '@hapi/boom'
import { ObjectId } from 'mongodb'

import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import {
  EXPORTER_ACCREDITATION_NUMBER,
  exporter,
  exporterAccreditation,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asOperator } from '#test/inject-auth.js'
import { organisationReadRepositoryOf } from '#vite/helpers/organisation-read-model.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { adminOverseasSitesListPath } from './admin-list.js'

const { buildOrganisation } = createOrganisationBuilders()

const ALPHA_REGISTRATION = 'R26EX5001180042PL'
const BETA_REGISTRATION = 'R26EX5001180043PL'

const now = new Date('2026-01-01T00:00:00.000Z')

const fullSite = {
  id: new ObjectId().toString(),
  name: 'Alpha Reprocessor',
  country: 'France',
  address: {
    line1: '1 Rue de Test',
    line2: 'Zone 2',
    townOrCity: 'Paris',
    stateOrRegion: 'Ile-de-France',
    postcode: '75001'
  },
  coordinates: '48.8566,2.3522',
  validFrom: new Date('2025-04-01T00:00:00.000Z'),
  createdAt: now,
  updatedAt: now
}

const minimalSite = {
  id: new ObjectId().toString(),
  name: 'Beta Reprocessor',
  country: 'Germany',
  address: { line1: '2 Teststrasse', townOrCity: 'Berlin' },
  createdAt: now,
  updatedAt: now
}

const thirdSite = {
  id: new ObjectId().toString(),
  name: 'Gamma Reprocessor',
  country: 'Spain',
  address: { line1: '3 Calle Mayor', townOrCity: 'Madrid' },
  createdAt: now,
  updatedAt: now
}

const sites = [fullSite, minimalSite, thirdSite]

const accredited = exporterAccreditation()

const createdIn2026 = [
  { status: 'created', updatedAt: '2026-01-01T09:00:00.000Z' }
]

/** An accredited exporter holding ORS 001 and 002, and a reprocessor. */
const accreditedOrganisation = buildOrganisation({
  statusHistory: createdIn2026,
  registrations: [
    exporter({
      registrationNumber: ALPHA_REGISTRATION,
      accreditationId: accredited.id,
      overseasSites: {
        '002': { overseasSiteId: minimalSite.id },
        '001': { overseasSiteId: fullSite.id }
      }
    }),
    reprocessor()
  ],
  accreditations: [accredited]
})

/** A registered-only exporter holding ORS 003. */
const registeredOnlyOrganisation = buildOrganisation({
  statusHistory: createdIn2026,
  registrations: [
    exporter({
      registrationNumber: BETA_REGISTRATION,
      overseasSites: { '003': { overseasSiteId: thirdSite.id } }
    })
  ]
})

const fullRow = {
  orgId: Number(accreditedOrganisation.organisationNumber),
  registrationNumber: ALPHA_REGISTRATION,
  accreditationNumber: EXPORTER_ACCREDITATION_NUMBER,
  orsId: '001',
  packagingWasteCategory: 'plastic',
  destinationCountry: 'France',
  overseasReprocessorName: 'Alpha Reprocessor',
  addressLine1: '1 Rue de Test',
  addressLine2: 'Zone 2',
  cityOrTown: 'Paris',
  stateProvinceOrRegion: 'Ile-de-France',
  postcode: '75001',
  coordinates: '48.8566,2.3522',
  validFrom: '2025-04-01T00:00:00.000Z'
}

const minimalRow = {
  orgId: Number(accreditedOrganisation.organisationNumber),
  registrationNumber: ALPHA_REGISTRATION,
  accreditationNumber: EXPORTER_ACCREDITATION_NUMBER,
  orsId: '002',
  packagingWasteCategory: 'plastic',
  destinationCountry: 'Germany',
  overseasReprocessorName: 'Beta Reprocessor',
  addressLine1: '2 Teststrasse',
  addressLine2: null,
  cityOrTown: 'Berlin',
  stateProvinceOrRegion: null,
  postcode: null,
  coordinates: null,
  validFrom: null
}

const registeredOnlyRow = {
  orgId: Number(registeredOnlyOrganisation.organisationNumber),
  registrationNumber: BETA_REGISTRATION,
  accreditationNumber: null,
  orsId: '003',
  packagingWasteCategory: 'plastic',
  destinationCountry: 'Spain',
  overseasReprocessorName: 'Gamma Reprocessor',
  addressLine1: '3 Calle Mayor',
  addressLine2: null,
  cityOrTown: 'Madrid',
  stateProvinceOrRegion: null,
  postcode: null,
  coordinates: null,
  validFrom: null
}

/**
 * @param {object} organisationReadRepository
 */
const serverOver = (organisationReadRepository) =>
  createTestServer({ repositories: { organisationReadRepository } })

const serverWith = async (organisations) =>
  serverOver(
    await organisationReadRepositoryOf(organisations, { overseasSites: sites })
  )

const list = (server, query = '') =>
  server.inject({
    method: 'GET',
    url: `${adminOverseasSitesListPath}${query}`,
    ...asServiceMaintainer()
  })

describe(`${adminOverseasSitesListPath} route`, () => {
  setupAuthContext()

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('with an accredited and a registered-only exporter', () => {
    let server

    beforeEach(async () => {
      server = await serverWith([
        registeredOnlyOrganisation,
        accreditedOrganisation
      ])
    })

    afterEach(async () => {
      await server.stop()
    })

    it("returns a row per exporter overseas site, sorted by ORS id, with this year's accreditation number", async () => {
      const response = await list(server)

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toStrictEqual({
        rows: [fullRow, minimalRow, registeredOnlyRow],
        pagination: {
          page: 1,
          pageSize: 50,
          totalItems: 3,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false
        }
      })
    })

    it('returns paginated rows and metadata when page and pageSize are provided', async () => {
      const response = await list(server, '?page=2&pageSize=1')

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.payload)
      expect(body.pagination).toStrictEqual({
        page: 2,
        pageSize: 1,
        totalItems: 3,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true
      })
      expect(body.rows).toStrictEqual([minimalRow])
    })

    it('filters by registrationNumber, ignoring case, before pagination is applied', async () => {
      const response = await list(
        server,
        `?registrationNumber=${ALPHA_REGISTRATION.toLowerCase()}&page=2&pageSize=1`
      )

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toStrictEqual({
        rows: [minimalRow],
        pagination: {
          page: 2,
          pageSize: 1,
          totalItems: 2,
          totalPages: 2,
          hasNextPage: false,
          hasPreviousPage: true
        }
      })
    })

    it('treats a blank registrationNumber filter as no filter', async () => {
      const response = await list(server, '?registrationNumber=%20%20')

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload).pagination.totalItems).toBe(3)
    })

    it('returns an empty page when the requested page is beyond totalPages', async () => {
      const response = await list(server, '?page=999&pageSize=1')

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.payload)
      expect(body.pagination).toStrictEqual({
        page: 999,
        pageSize: 1,
        totalItems: 3,
        totalPages: 3,
        hasNextPage: false,
        hasPreviousPage: true
      })
      expect(body.rows).toStrictEqual([])
    })

    it('returns all rows when all=true is provided', async () => {
      const response = await list(server, '?all=true&page=2&pageSize=1')

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.payload)
      expect(body.rows.map((row) => row.orsId)).toStrictEqual([
        '001',
        '002',
        '003'
      ])
      expect(body.pagination).toStrictEqual({
        page: 1,
        pageSize: 3,
        totalItems: 3,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false
      })
    })

    it('returns 401 when not authenticated', async () => {
      const response = await server.inject({
        method: 'GET',
        url: adminOverseasSitesListPath
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 when authenticated as standard user', async () => {
      const response = await server.inject({
        method: 'GET',
        url: adminOverseasSitesListPath,
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })

  it('gives no accreditation number when the exporter holds none for the current year', async () => {
    vi.setSystemTime(new Date('2027-03-01T12:00:00.000Z'))
    const server = await serverWith([accreditedOrganisation])

    const response = await list(server)

    await server.stop()
    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(
      JSON.parse(response.payload).rows.map((row) => row.accreditationNumber)
    ).toStrictEqual([null, null])
  })

  it('returns the default empty page size when all=true and there are no rows', async () => {
    const server = await serverWith([])

    const response = await list(server, '?all=true')

    await server.stop()
    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toStrictEqual({
      rows: [],
      pagination: {
        page: 1,
        pageSize: 50,
        totalItems: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false
      }
    })
  })

  it('returns 500 for unexpected repository failures', async () => {
    const server = await serverOver(() => ({
      findAll: vi.fn().mockRejectedValue(new Error('Database timeout'))
    }))

    const response = await list(server)

    await server.stop()
    expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
  })

  it('re-throws Boom errors from the repository', async () => {
    const server = await serverOver(() => ({
      findAll: vi.fn().mockRejectedValue(Boom.badRequest('Invalid query'))
    }))

    const response = await list(server)

    await server.stop()
    expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
  })

  it.each([
    '?page=0',
    '?page=1.5',
    '?pageSize=0',
    '?pageSize=201',
    '?pageSize=1.5',
    '?all=maybe'
  ])('returns 422 for invalid query %s', async (query) => {
    const server = await createTestServer({})

    const response = await list(server, query)

    await server.stop()
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })
})
