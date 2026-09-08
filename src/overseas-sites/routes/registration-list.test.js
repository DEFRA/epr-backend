import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'
import { afterEach, describe, expect, it } from 'vitest'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asOperator } from '#test/inject-auth.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

const SITE_ONE_ID = new ObjectId().toString()
const SITE_TWO_ID = new ObjectId().toString()

const now = new Date('2025-04-01T00:00:00.000Z')
const approvedFrom = new Date('2024-01-01T00:00:00.000Z')

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
  coordinates: '52.5200,13.4050',
  validFrom: approvedFrom,
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

/**
 * An exporter registration holding overseas sites and no accreditation — the
 * case the accreditation-keyed route cannot serve.
 */
const buildRegisteredOnlyExporter = () => {
  const registration = buildRegistration({
    wasteProcessingType: 'exporter',
    overseasSites: DEFAULT_OVERSEAS_SITES
  })

  return {
    organisation: buildOrganisation({ registrations: [registration] }),
    registration
  }
}

const buildAccreditedExporter = () => {
  const accreditation = buildAccreditation({ wasteProcessingType: 'exporter' })
  const registration = buildRegistration({
    wasteProcessingType: 'exporter',
    accreditationId: accreditation.id,
    overseasSites: DEFAULT_OVERSEAS_SITES
  })

  return {
    organisation: buildOrganisation({
      registrations: [registration],
      accreditations: [accreditation]
    }),
    registration
  }
}

const buildReprocessor = () => {
  const registration = buildRegistration({
    wasteProcessingType: 'reprocessor'
  })

  return {
    organisation: buildOrganisation({ registrations: [registration] }),
    registration
  }
}

/** @type {ReturnType<typeof buildOrganisation>[]} */
const NO_OTHER_ORGANISATIONS = []

const pathFor = ({ organisationId, registrationId }) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/overseas-sites`

const expectedDetail = {
  '001': {
    name: 'Beta Reprocessor',
    country: 'Germany',
    address: {
      line1: '2 Teststrasse',
      line2: 'Zone 2',
      townOrCity: 'Berlin',
      stateOrRegion: 'Berlin-Mitte',
      postcode: '10115'
    },
    coordinates: '52.5200,13.4050'
  },
  '002': {
    name: 'Alpha Reprocessor',
    country: 'France',
    address: {
      line1: '1 Rue de Test',
      townOrCity: 'Paris'
    },
    coordinates: null
  }
}

describe('GET registration overseas-sites', () => {
  setupAuthContext()

  let server

  const startServer = async (
    { organisation, otherOrganisations = NO_OTHER_ORGANISATIONS, sites },
    config = {}
  ) => {
    server = await createTestServer({
      config,
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository([
          organisation,
          ...otherOrganisations
        ]),
        overseasSitesRepository: createInMemoryOverseasSitesRepository(sites)
      }
    })
    return server
  }

  const asRegulator = () => ({
    headers: {
      Authorization: `Bearer ${entraIdMockAuthTokens.regulatorToken}`
    }
  })

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  it('resolves site detail for a registration that holds no accreditation', async () => {
    const { organisation, registration } = buildRegisteredOnlyExporter()
    await startServer({ organisation, sites: [siteOne, siteTwo] })

    const response = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: organisation.id,
        registrationId: registration.id
      }),
      ...asRegulator()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toStrictEqual(expectedDetail)
  })

  it('resolves site detail for a registration that holds an accreditation', async () => {
    const { organisation, registration } = buildAccreditedExporter()
    await startServer({ organisation, sites: [siteOne, siteTwo] })

    const response = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: organisation.id,
        registrationId: registration.id
      }),
      ...asRegulator()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toStrictEqual(expectedDetail)
  })

  it('returns an empty object for a reprocessor registration', async () => {
    const { organisation, registration } = buildReprocessor()
    await startServer({ organisation, sites: [] })

    const response = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: organisation.id,
        registrationId: registration.id
      }),
      ...asRegulator()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toStrictEqual({})
  })

  it('401s when not authenticated', async () => {
    const { organisation, registration } = buildRegisteredOnlyExporter()
    await startServer({ organisation, sites: [siteOne, siteTwo] })

    const response = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: organisation.id,
        registrationId: registration.id
      })
    })

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
  })

  it('allows a standard user', async () => {
    const { organisation, registration } = buildRegisteredOnlyExporter()
    await startServer({ organisation, sites: [siteOne, siteTwo] })

    const response = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: organisation.id,
        registrationId: registration.id
      }),
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(Object.keys(JSON.parse(response.payload)).sort()).toEqual([
      '001',
      '002'
    ])
  })

  // Injected bare rather than through asServiceMaintainer, because every admin
  // tier also carries organisation.read and would satisfy the route through
  // that instead, leaving admin.read unpinned.
  it('allows a caller holding admin.read alone', async () => {
    const { organisation, registration } = buildRegisteredOnlyExporter()
    await startServer({ organisation, sites: [siteOne, siteTwo] })

    const response = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: organisation.id,
        registrationId: registration.id
      }),
      auth: {
        strategy: 'access-token',
        credentials: {
          scope: [SCOPES.adminRead],
          id: 'test-admin-read-id',
          email: 'admin-read@example.com'
        }
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(Object.keys(JSON.parse(response.payload)).sort()).toEqual([
      '001',
      '002'
    ])
  })

  it('allows the basic-auth machine credential', async () => {
    const { organisation, registration } = buildRegisteredOnlyExporter()
    await startServer(
      { organisation, sites: [siteOne, siteTwo] },
      { basicAuth: { username: 'basic-auth-user', password: 'changeme' } }
    )

    const response = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: organisation.id,
        registrationId: registration.id
      }),
      headers: {
        Authorization: `Basic ${Buffer.from('basic-auth-user:changeme').toString('base64')}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(Object.keys(JSON.parse(response.payload)).sort()).toEqual([
      '001',
      '002'
    ])
  })

  it('403s an authenticated caller holding neither read scope', async () => {
    const { organisation, registration } = buildRegisteredOnlyExporter()
    await startServer({ organisation, sites: [siteOne, siteTwo] })

    const response = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: organisation.id,
        registrationId: registration.id
      }),
      auth: {
        strategy: 'access-token',
        credentials: {
          scope: [],
          id: 'test-unscoped-id',
          email: 'unscoped@example.com'
        }
      }
    })

    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
  })

  it('404s when the registration does not exist', async () => {
    const { organisation } = buildRegisteredOnlyExporter()
    await startServer({ organisation, sites: [siteOne, siteTwo] })

    const response = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: organisation.id,
        registrationId: new ObjectId().toString()
      }),
      ...asRegulator()
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('404s when the registration belongs to another organisation', async () => {
    const { organisation } = buildRegisteredOnlyExporter()
    const { organisation: otherOrganisation, registration: othersOwnSites } =
      buildRegisteredOnlyExporter()
    await startServer({
      organisation,
      otherOrganisations: [otherOrganisation],
      sites: [siteOne, siteTwo]
    })

    const underItsOwner = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: otherOrganisation.id,
        registrationId: othersOwnSites.id
      }),
      ...asRegulator()
    })

    const underTheOtherOrganisation = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: organisation.id,
        registrationId: othersOwnSites.id
      }),
      ...asRegulator()
    })

    expect(underItsOwner.statusCode).toBe(StatusCodes.OK)
    expect(underTheOtherOrganisation.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('404s when the organisation does not exist', async () => {
    const { organisation, registration } = buildRegisteredOnlyExporter()
    await startServer({ organisation, sites: [siteOne, siteTwo] })

    const response = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: new ObjectId().toString(),
        registrationId: registration.id
      }),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('rejects a malformed registration id', async () => {
    const { organisation } = buildRegisteredOnlyExporter()
    await startServer({ organisation, sites: [siteOne, siteTwo] })

    const response = await server.inject({
      method: 'GET',
      url: pathFor({
        organisationId: organisation.id,
        registrationId: 'not-a-valid-id'
      }),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('returns 500 and logs the failure when a repository errors unexpectedly', async () => {
    const organisationId = new ObjectId().toString()
    const registrationId = new ObjectId().toString()

    server = await createTestServer({
      repositories: {
        organisationsRepository: () => ({
          findRegistrationById: () =>
            Promise.reject(new Error('database unavailable'))
        })
      }
    })

    const response = await server.inject({
      method: 'GET',
      url: pathFor({ organisationId, registrationId }),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    expect(server.loggerMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          '/registrations/{registrationId}/overseas-sites'
        ),
        err: expect.objectContaining({ message: 'database unavailable' })
      })
    )
  })
})
