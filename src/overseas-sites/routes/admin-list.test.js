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
  buildAccreditation,
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
    expect(body).toStrictEqual({
      rows: [
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
      ],
      pagination: {
        page: 1,
        pageSize: 50,
        totalItems: 2,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false
      }
    })
  })

  it('returns paginated rows and metadata when page and pageSize are provided', async () => {
    const response = await getServer().inject({
      method: 'GET',
      url: `${adminOverseasSitesListPath}?page=2&pageSize=1`,
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)

    const body = JSON.parse(response.payload)
    expect(body.pagination).toStrictEqual({
      page: 2,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true
    })
    expect(body.rows).toHaveLength(1)
    expect(body.rows[0].orsId).toBe('002')
  })

  it('returns all rows when all=true is provided', async () => {
    const response = await getServer().inject({
      method: 'GET',
      url: `${adminOverseasSitesListPath}?all=true&page=2&pageSize=1`,
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)

    const body = JSON.parse(response.payload)
    expect(body.rows).toHaveLength(2)
    expect(body.rows.map((row) => row.orsId)).toStrictEqual(['001', '002'])
    expect(body.pagination).toStrictEqual({
      page: 1,
      pageSize: 2,
      totalItems: 2,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false
    })
  })

  it('resolves accreditationNumber from matched accreditation when registration values are missing', async () => {
    const organisationsRepository = getServer().app.organisationsRepository
    const overseasSitesRepository = getServer().app.overseasSitesRepository
    const [existingSite] = await overseasSitesRepository.findAll()

    await organisationsRepository.insert(
      asOrganisation(
        buildOrganisation({
          registrations: [
            buildRegistration({
              wasteProcessingType: 'exporter',
              accreditationId: '507f1f77bcf86cd799439011',
              accreditationNumber: null,
              accreditation: null,
              overseasSites: {
                '099': { overseasSiteId: existingSite.id }
              }
            })
          ],
          accreditations: [
            buildAccreditation({
              id: '507f1f77bcf86cd799439011',
              accreditationNumber: 'ACC-LOOKUP-099'
            })
          ]
        })
      )
    )

    const response = await getServer().inject({
      method: 'GET',
      url: adminOverseasSitesListPath,
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const body = JSON.parse(response.payload)
    const row = body.rows.find((candidate) => candidate.orsId === '099')

    expect(row).toBeDefined()
    expect(row.accreditationNumber).toBe('ACC-LOOKUP-099')
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
    const body = JSON.parse(response.payload)
    expect(body.rows.some((row) => row.orsId === '999')).toBe(false)
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
}

const defineAdditionalEdgeCaseTests = () => {
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

  it('maps missing material and orgId to null in response rows', async () => {
    const malformedOrganisationsRepository = {
      findAll: vi.fn().mockResolvedValue([
        {
          orgId: undefined,
          registrations: [
            {
              overseasSites: {
                '010': { overseasSiteId: 'site-010' }
              }
            }
          ]
        }
      ])
    }
    const overseasSitesRepository = {
      findAll: vi.fn().mockResolvedValue([
        {
          id: 'site-010',
          country: 'Norway',
          name: 'Mapped Site',
          address: {
            line1: '1 Main St',
            townOrCity: 'Oslo'
          }
        }
      ])
    }

    const malformedServer = await createTestServer({
      repositories: {
        organisationsRepository: () => malformedOrganisationsRepository,
        overseasSitesRepository: () => overseasSitesRepository
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
    const body = JSON.parse(response.payload)

    expect(body.rows).toHaveLength(1)
    expect(body.rows[0].orsId).toBe('010')
    expect(body.rows[0].packagingWasteCategory).toBeNull()
    expect(body.rows[0].orgId).toBeNull()
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
