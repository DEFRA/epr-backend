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

const defineResponseAndAccessTests = ({ getServer }) => {
  it('returns 200 and all ticket fields for ORS mappings', async () => {
    const response = await getServer().inject({
      method: 'GET',
      url: adminOverseasSitesListPath,
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)

    const body = JSON.parse(response.payload)
    expect(body).toStrictEqual([
      {
        orsId: '001',
        packagingWasteCategory: 'plastic',
        orgId: expect.any(Number),
        registrationNumber: null,
        accreditationNumber: null,
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
        packagingWasteCategory: 'plastic',
        orgId: expect.any(Number),
        registrationNumber: null,
        accreditationNumber: null,
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
    const response = await getServer().inject({
      method: 'GET',
      url: adminOverseasSitesListPath
    })

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
  })

  it('returns 403 when authenticated as standard user', async () => {
    const response = await getServer().inject({
      method: 'GET',
      url: adminOverseasSitesListPath,
      ...asStandardUser({ linkedOrgId: 'org-123' })
    })

    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
  })
}

const asOrganisation = (organisation) =>
  /** @type {import('#domain/organisations/model.js').Organisation} */ (
    /** @type {unknown} */ (organisation)
  )

const defineErrorHandlingTests = ({
  getServer,
  getOverseasSitesRepository
}) => {
  it('returns 500 for unexpected repository failures', async () => {
    getOverseasSitesRepository().findAll.mockRejectedValueOnce(
      new Error('Database timeout')
    )

    const response = await getServer().inject({
      method: 'GET',
      url: adminOverseasSitesListPath,
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
  })

  it('re-throws Boom errors from repository', async () => {
    const Boom = await import('@hapi/boom')
    getOverseasSitesRepository().findAll.mockRejectedValueOnce(
      Boom.default.badRequest('Invalid query')
    )

    const response = await getServer().inject({
      method: 'GET',
      url: adminOverseasSitesListPath,
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
  })
}

const defineMappingEdgeCaseTests = ({ getServer }) => {
  it('skips mappings that reference unknown overseas site ids', async () => {
    const organisationsRepository = getServer().app.organisationsRepository
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

    const response = await getServer().inject({
      method: 'GET',
      url: adminOverseasSitesListPath,
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(
      JSON.parse(response.payload).some((row) => row.orsId === '999')
    ).toBe(false)
  })

  it('handles organisations with missing registrations', async () => {
    const malformedOrganisationsRepository = {
      findAll: vi.fn().mockResolvedValue([{ registrations: null }])
    }
    const emptyOverseasSitesRepository = {
      findAll: vi.fn().mockResolvedValue([])
    }

    const malformedServer = await createTestServer({
      repositories: {
        organisationsRepository: () => malformedOrganisationsRepository,
        overseasSitesRepository: () => emptyOverseasSitesRepository
      },
      featureFlags: createInMemoryFeatureFlags({
        overseasSites: true
      })
    })

    const response = await malformedServer.inject({
      method: 'GET',
      url: adminOverseasSitesListPath,
      ...asServiceMaintainer()
    })

    await malformedServer.stop()

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toStrictEqual([])
  })
}

const defineAdditionalEdgeCaseTests = () => {
  it('uses matched organisation accreditation when registration references an accreditation id', async () => {
    const organisationsRepository = {
      findAll: vi.fn().mockResolvedValue([
        {
          orgId: 42,
          registrations: [
            {
              material: 'plastic',
              registrationNumber: 'REG-123',
              accreditationId: 'acc-2',
              overseasSites: {
                '003': { overseasSiteId: 'site-1' }
              }
            }
          ],
          accreditations: [
            { id: 'acc-1', accreditationNumber: 'ACC-001' },
            { id: 'acc-2', accreditationNumber: 'ACC-002' }
          ]
        }
      ])
    }

    const overseasSitesRepository = {
      findAll: vi.fn().mockResolvedValue([
        {
          id: 'site-1',
          country: 'France',
          name: 'Alpha Reprocessor',
          address: {
            line1: '1 Rue de Test',
            townOrCity: 'Paris'
          },
          coordinates: null,
          validFrom: null
        }
      ])
    }

    const server = await createTestServer({
      repositories: {
        organisationsRepository: () => organisationsRepository,
        overseasSitesRepository: () => overseasSitesRepository
      },
      featureFlags: createInMemoryFeatureFlags({
        overseasSites: true
      })
    })

    const response = await server.inject({
      method: 'GET',
      url: adminOverseasSitesListPath,
      ...asServiceMaintainer()
    })

    await server.stop()

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toStrictEqual([
      {
        orsId: '003',
        packagingWasteCategory: 'plastic',
        orgId: 42,
        registrationNumber: 'REG-123',
        accreditationNumber: 'ACC-002',
        destinationCountry: 'France',
        overseasReprocessorName: 'Alpha Reprocessor',
        addressLine1: '1 Rue de Test',
        addressLine2: null,
        cityOrTown: 'Paris',
        stateProvinceOrRegion: null,
        postcode: null,
        coordinates: null,
        validFrom: null
      }
    ])
  })

  it('handles registrations with missing overseasSites mappings', async () => {
    const malformedOrganisationsRepository = {
      findAll: vi
        .fn()
        .mockResolvedValue([{ registrations: [{ overseasSites: null }] }])
    }
    const emptyOverseasSitesRepository = {
      findAll: vi.fn().mockResolvedValue([])
    }

    const malformedServer = await createTestServer({
      repositories: {
        organisationsRepository: () => malformedOrganisationsRepository,
        overseasSitesRepository: () => emptyOverseasSitesRepository
      },
      featureFlags: createInMemoryFeatureFlags({
        overseasSites: true
      })
    })

    const response = await malformedServer.inject({
      method: 'GET',
      url: adminOverseasSitesListPath,
      ...asServiceMaintainer()
    })

    await malformedServer.stop()

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toStrictEqual([])
  })

  it('uses null defaults when material and orgId are missing', async () => {
    const organisationsRepository = {
      findAll: vi.fn().mockResolvedValue([
        {
          registrations: [
            {
              overseasSites: {
                '004': { overseasSiteId: 'site-1' }
              }
            }
          ],
          accreditations: []
        }
      ])
    }

    const overseasSitesRepository = {
      findAll: vi.fn().mockResolvedValue([
        {
          id: 'site-1',
          country: 'France',
          name: 'Alpha Reprocessor',
          address: {
            line1: '1 Rue de Test',
            townOrCity: 'Paris'
          }
        }
      ])
    }

    const server = await createTestServer({
      repositories: {
        organisationsRepository: () => organisationsRepository,
        overseasSitesRepository: () => overseasSitesRepository
      },
      featureFlags: createInMemoryFeatureFlags({
        overseasSites: true
      })
    })

    const response = await server.inject({
      method: 'GET',
      url: adminOverseasSitesListPath,
      ...asServiceMaintainer()
    })

    await server.stop()

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toStrictEqual([
      {
        orsId: '004',
        packagingWasteCategory: null,
        orgId: null,
        registrationNumber: null,
        accreditationNumber: null,
        destinationCountry: 'France',
        overseasReprocessorName: 'Alpha Reprocessor',
        addressLine1: '1 Rue de Test',
        addressLine2: null,
        cityOrTown: 'Paris',
        stateProvinceOrRegion: null,
        postcode: null,
        coordinates: null,
        validFrom: null
      }
    ])
  })

  it('handles repository rows without a registrations property', async () => {
    const malformedOrganisationsRepository = {
      findAll: vi.fn().mockResolvedValue([{}])
    }
    const emptyOverseasSitesRepository = {
      findAll: vi.fn().mockResolvedValue([])
    }

    const malformedServer = await createTestServer({
      repositories: {
        organisationsRepository: () => malformedOrganisationsRepository,
        overseasSitesRepository: () => emptyOverseasSitesRepository
      },
      featureFlags: createInMemoryFeatureFlags({
        overseasSites: true
      })
    })

    const response = await malformedServer.inject({
      method: 'GET',
      url: adminOverseasSitesListPath,
      ...asServiceMaintainer()
    })

    await malformedServer.stop()

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toStrictEqual([])
  })
}

const seedOverseasSites = async (overseasSitesRepository) => {
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

  return { siteOne, siteTwo }
}

const createExporterRegistration = ({ siteOne, siteTwo }) => {
  return buildRegistration({
    wasteProcessingType: 'exporter',
    overseasSites: {
      '002': { overseasSiteId: siteTwo.id },
      '001': { overseasSiteId: siteOne.id }
    }
  })
}

const insertBaseOrganisation = async (
  organisationsRepository,
  registration
) => {
  await organisationsRepository.insert(
    asOrganisation(
      buildOrganisation({
        registrations: [registration],
        accreditations: []
      })
    )
  )
}

const setupFeatureFlagEnabledScenario = async () => {
  const organisationsRepositoryFactory = createInMemoryOrganisationsRepository()
  const organisationsRepository = organisationsRepositoryFactory()

  const overseasSitesRepository = createInMemoryOverseasSitesRepository()()
  vi.spyOn(overseasSitesRepository, 'findAll')

  const sites = await seedOverseasSites(overseasSitesRepository)
  const registration = createExporterRegistration(sites)
  await insertBaseOrganisation(organisationsRepository, registration)

  const server = await createTestServer({
    repositories: {
      organisationsRepository: organisationsRepositoryFactory,
      overseasSitesRepository: () => overseasSitesRepository
    },
    featureFlags: createInMemoryFeatureFlags({
      overseasSites: true
    })
  })

  return {
    server,
    overseasSitesRepository
  }
}

describe(`${adminOverseasSitesListPath} route`, () => {
  setupAuthContext()

  describe('when feature flag is enabled', () => {
    let server
    let overseasSitesRepository

    beforeAll(async () => {
      const setup = await setupFeatureFlagEnabledScenario()
      server = setup.server
      overseasSitesRepository = setup.overseasSitesRepository
    })

    afterEach(() => {
      vi.clearAllMocks()
    })

    afterAll(async () => {
      if (server) {
        await server.stop()
      }
    })

    defineResponseAndAccessTests({
      getServer: () => server
    })
    defineErrorHandlingTests({
      getServer: () => server,
      getOverseasSitesRepository: () => overseasSitesRepository
    })
    defineMappingEdgeCaseTests({
      getServer: () => server
    })
    defineAdditionalEdgeCaseTests()
  })

  describe('when feature flag is disabled', () => {
    it('returns 404', async () => {
      const server = await createTestServer({
        featureFlags: createInMemoryFeatureFlags({
          overseasSites: false
        })
      })

      const response = await server.inject({
        method: 'GET',
        url: adminOverseasSitesListPath,
        ...asServiceMaintainer()
      })

      await server.stop()

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})
