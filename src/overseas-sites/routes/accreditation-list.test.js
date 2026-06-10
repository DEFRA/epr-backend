import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'
import { afterEach, describe, expect, it } from 'vitest'

import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

const SITE_ONE_ID = new ObjectId().toString()
const SITE_TWO_ID = new ObjectId().toString()
const MISSING_SITE_ID = new ObjectId().toString()

const now = new Date('2025-04-01T00:00:00.000Z')

const siteOne = {
  id: SITE_ONE_ID,
  name: 'Beta Reprocessor',
  country: 'Germany',
  address: {
    line1: '2 Teststrasse',
    line2: 'Zone 2',
    townOrCity: 'Berlin',
    stateOrRegion: 'Berlin-Mitte',
    postcode: '10115'
  },
  createdAt: now,
  updatedAt: now
}

const siteTwo = {
  id: SITE_TWO_ID,
  name: 'Alpha Reprocessor',
  country: 'France',
  address: {
    line1: '1 Rue de Test',
    townOrCity: 'Paris'
  },
  createdAt: now,
  updatedAt: now
}

const DEFAULT_OVERSEAS_SITES = {
  '001': { overseasSiteId: SITE_ONE_ID },
  '002': { overseasSiteId: SITE_TWO_ID }
}

const buildScenario = ({ overseasSites = DEFAULT_OVERSEAS_SITES } = {}) => {
  const accreditation = buildAccreditation({ wasteProcessingType: 'exporter' })
  const registrationOverrides = {
    wasteProcessingType: 'exporter',
    accreditationId: accreditation.id
  }
  if (overseasSites !== null) {
    registrationOverrides.overseasSites = overseasSites
  }
  const registration = buildRegistration(registrationOverrides)
  const organisation = buildOrganisation({
    registrations: [registration],
    accreditations: [accreditation]
  })

  return { organisation, registration, accreditation }
}

const pathFor = ({ organisationId, registrationId, accreditationId }) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/overseas-sites`

describe('GET accreditation overseas-sites', () => {
  setupAuthContext()

  let server

  const startServer = async ({ organisation, sites }) => {
    server = await createTestServer({
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository([
          organisation
        ]),
        overseasSitesRepository: createInMemoryOverseasSitesRepository(sites)
      },
      featureFlags: createInMemoryFeatureFlags()
    })
    return server
  }

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  it('returns the accreditation approved overseas sites with full detail', async () => {
    const { organisation, registration, accreditation } = buildScenario()
    await startServer({ organisation, sites: [siteOne, siteTwo] })

    const response = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: organisation.id,
        registrationId: registration.id,
        accreditationId: accreditation.id
      }),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toStrictEqual([
      {
        orsId: '001',
        name: 'Beta Reprocessor',
        country: 'Germany',
        address: {
          line1: '2 Teststrasse',
          line2: 'Zone 2',
          townOrCity: 'Berlin',
          stateOrRegion: 'Berlin-Mitte',
          postcode: '10115'
        }
      },
      {
        orsId: '002',
        name: 'Alpha Reprocessor',
        country: 'France',
        address: {
          line1: '1 Rue de Test',
          townOrCity: 'Paris'
        }
      }
    ])
  })

  it('sorts entries by their three-digit ORS id', async () => {
    const { organisation, registration, accreditation } = buildScenario({
      overseasSites: {
        '010': { overseasSiteId: SITE_TWO_ID },
        '002': { overseasSiteId: SITE_ONE_ID }
      }
    })
    await startServer({ organisation, sites: [siteOne, siteTwo] })

    const response = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: organisation.id,
        registrationId: registration.id,
        accreditationId: accreditation.id
      }),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload).map((entry) => entry.orsId)).toEqual([
      '002',
      '010'
    ])
  })

  it('returns null detail for an approved site whose record is missing', async () => {
    const { organisation, registration, accreditation } = buildScenario({
      overseasSites: {
        '001': { overseasSiteId: MISSING_SITE_ID }
      }
    })
    await startServer({ organisation, sites: [siteOne] })

    const response = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: organisation.id,
        registrationId: registration.id,
        accreditationId: accreditation.id
      }),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toStrictEqual([
      { orsId: '001', name: null, country: null, address: null }
    ])
  })

  it('returns an empty array when the accreditation has no approved sites', async () => {
    const { organisation, registration, accreditation } = buildScenario({
      overseasSites: {}
    })
    await startServer({ organisation, sites: [] })

    const response = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: organisation.id,
        registrationId: registration.id,
        accreditationId: accreditation.id
      }),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toStrictEqual([])
  })

  it('returns an empty array when the registration holds no overseas-sites map', async () => {
    const { organisation, registration, accreditation } = buildScenario({
      overseasSites: null
    })
    await startServer({ organisation, sites: [] })

    const response = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: organisation.id,
        registrationId: registration.id,
        accreditationId: accreditation.id
      }),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toStrictEqual([])
  })

  it('allows a standard user to read the sites', async () => {
    const { organisation, registration, accreditation } = buildScenario()
    await startServer({ organisation, sites: [siteOne, siteTwo] })

    const response = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: organisation.id,
        registrationId: registration.id,
        accreditationId: accreditation.id
      }),
      ...asStandardUser({ linkedOrgId: organisation.id })
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toHaveLength(2)
  })

  it('404s when the organisation does not exist', async () => {
    const { organisation, registration, accreditation } = buildScenario()
    await startServer({ organisation, sites: [siteOne, siteTwo] })

    const response = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: new ObjectId().toString(),
        registrationId: registration.id,
        accreditationId: accreditation.id
      }),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('404s when the registration does not belong to the organisation', async () => {
    const { organisation, accreditation } = buildScenario()
    await startServer({ organisation, sites: [siteOne, siteTwo] })

    const response = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: organisation.id,
        registrationId: new ObjectId().toString(),
        accreditationId: accreditation.id
      }),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('404s when the accreditation does not exist', async () => {
    const { organisation, registration } = buildScenario()
    await startServer({ organisation, sites: [siteOne, siteTwo] })

    const response = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: organisation.id,
        registrationId: registration.id,
        accreditationId: new ObjectId().toString()
      }),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('404s when the accreditation belongs to a different registration', async () => {
    const otherAccreditation = buildAccreditation({
      wasteProcessingType: 'exporter'
    })
    const { organisation, registration } = buildScenario()
    const organisationWithExtraAccreditation = buildOrganisation({
      registrations: organisation.registrations,
      accreditations: [...organisation.accreditations, otherAccreditation]
    })
    await startServer({
      organisation: organisationWithExtraAccreditation,
      sites: [siteOne, siteTwo]
    })

    const response = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: organisationWithExtraAccreditation.id,
        registrationId: registration.id,
        accreditationId: otherAccreditation.id
      }),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('rejects a malformed organisation id', async () => {
    const { organisation, registration, accreditation } = buildScenario()
    await startServer({ organisation, sites: [siteOne, siteTwo] })

    const response = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: 'not-a-valid-id',
        registrationId: registration.id,
        accreditationId: accreditation.id
      }),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('returns 500 and logs the failure when a repository errors unexpectedly', async () => {
    const organisationId = new ObjectId().toString()
    const registrationId = new ObjectId().toString()
    const accreditationId = new ObjectId().toString()

    server = await createTestServer({
      repositories: {
        organisationsRepository: () => ({
          findRegistrationById: () =>
            Promise.reject(new Error('database unavailable')),
          findAccreditationById: () => Promise.resolve({})
        })
      },
      featureFlags: createInMemoryFeatureFlags()
    })

    const response = await server.inject({
      method: 'GET',
      url: pathFor({ organisationId, registrationId, accreditationId }),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    expect(server.loggerMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          '/accreditations/{accreditationId}/overseas-sites'
        ),
        err: expect.objectContaining({ message: 'database unavailable' })
      })
    )
  })
})
