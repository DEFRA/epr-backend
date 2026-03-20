import { StatusCodes } from 'http-status-codes'
import {
  vi,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach
} from 'vitest'

import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { adminOverseasSitesListPath } from './admin-list.js'

describe(`${adminOverseasSitesListPath} route`, () => {
  setupAuthContext()

  describe('when feature flag is enabled', () => {
    let server
    let overseasSitesRepository

    beforeAll(async () => {
      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository()
      const organisationsRepository = organisationsRepositoryFactory()

      overseasSitesRepository = createInMemoryOverseasSitesRepository()()
      vi.spyOn(overseasSitesRepository, 'findAll')

      const now = new Date('2026-01-01T00:00:00.000Z')

      const siteOne = await overseasSitesRepository.create({
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
      })

      const siteTwo = await overseasSitesRepository.create({
        name: 'Beta Reprocessor',
        country: 'Germany',
        address: {
          line1: '2 Teststrasse',
          townOrCity: 'Berlin'
        },
        createdAt: now,
        updatedAt: now
      })

      const registration = buildRegistration({
        wasteProcessingType: 'exporter',
        overseasSites: {
          '002': { overseasSiteId: siteTwo.id },
          '001': { overseasSiteId: siteOne.id }
        }
      })

      await organisationsRepository.insert(
        buildOrganisation({
          registrations: [registration],
          accreditations: []
        })
      )

      server = await createTestServer({
        repositories: {
          organisationsRepository: organisationsRepositoryFactory,
          overseasSitesRepository: () => overseasSitesRepository
        },
        featureFlags: createInMemoryFeatureFlags({
          overseasSites: true
        })
      })
    })

    afterEach(() => {
      vi.clearAllMocks()
    })

    afterAll(async () => {
      await server.stop()
    })

    it('returns 200 and all ticket fields for ORS mappings', async () => {
      const response = await server.inject({
        method: 'GET',
        url: adminOverseasSitesListPath,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)

      const body = JSON.parse(response.payload)
      expect(body).toStrictEqual([
        {
          orsId: '001',
          destinationCountry: 'France',
          overseasReprocessorName: 'Alpha Reprocessor',
          addressLine1: '1 Rue de Test',
          addressLine2: 'Zone 2',
          cityOrTown: 'Paris',
          stateProvinceOrRegion: 'Ile-de-France',
          postcode: '75001',
          coordinates: '48.8566,2.3522',
          validFrom: '2025-04-01T00:00:00.000Z'
        },
        {
          orsId: '002',
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
      ])
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
        ...asStandardUser({ linkedOrgId: 'org-123' })
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('returns 500 for unexpected repository failures', async () => {
      overseasSitesRepository.findAll.mockRejectedValueOnce(
        new Error('Database timeout')
      )

      const response = await server.inject({
        method: 'GET',
        url: adminOverseasSitesListPath,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })

    it('re-throws Boom errors from repository', async () => {
      const Boom = await import('@hapi/boom')
      overseasSitesRepository.findAll.mockRejectedValueOnce(
        Boom.default.badRequest('Invalid query')
      )

      const response = await server.inject({
        method: 'GET',
        url: adminOverseasSitesListPath,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
    })

    it('skips mappings that reference unknown overseas site ids', async () => {
      const organisationsRepository = server.app.organisationsRepository
      await organisationsRepository.insert(
        buildOrganisation({
          registrations: [
            buildRegistration({
              wasteProcessingType: 'exporter',
              overseasSites: {
                999: { overseasSiteId: 'missing-site-id' }
              }
            })
          ],
          accreditations: []
        })
      )

      const response = await server.inject({
        method: 'GET',
        url: adminOverseasSitesListPath,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(
        JSON.parse(response.payload).some((row) => row.orsId === '999')
      ).toBe(false)
    })
  })
})
