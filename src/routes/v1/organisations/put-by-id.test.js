import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration,
  prepareOrgUpdate
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { testOnlyServiceMaintainerCanAccess } from '#vite/helpers/test-invalid-roles-scenarios.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'

/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { StatusHistoryEntry } from '#domain/organisations/accreditation.js' */

const { validToken } = entraIdMockAuthTokens

const mockCdpAuditing = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockCdpAuditing(...args)
}))

describe('PUT /v1/organisations/{id}', () => {
  setupAuthContext()
  let server
  let organisationsRepository

  beforeEach(async () => {
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()

    server = await createTestServer({
      repositories: {
        organisationsRepository: organisationsRepositoryFactory,
        systemLogsRepository: createSystemLogsRepository()
      }
    })
  })

  afterAll(() => {
    vi.resetAllMocks()
  })

  const createOrganisation = async () => {
    const fixture = buildOrganisation()
    const organisationId = fixture.id
    await organisationsRepository.insert(fixture)

    const fetchResponse = await server.inject({
      method: 'GET',
      url: `/v1/organisations/${organisationId}`,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(fetchResponse.statusCode).toBe(StatusCodes.OK)

    return JSON.parse(fetchResponse.payload)
  }

  describe('happy path', () => {
    it('returns 200 and the updated organisation when the org Id exists, the version is correct and the fragment is valid', async () => {
      const org = await createOrganisation()

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          version: org.version,
          updateFragment: { ...org, wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.payload)
      // returned organisation should have the same id and an incremented version
      expect(body.id).toBe(org.id)
      expect(body.version).toBe(org.version + 1)
      expect(body.wasteProcessingTypes).toEqual(['reprocessor'])
    })

    it('includes Cache-Control header in successful response', async () => {
      const org = await createOrganisation()

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          version: org.version,
          updateFragment: { wasteProcessingTypes: org.wasteProcessingTypes }
        }
      })

      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    })

    it('captures a system log and audit event', async () => {
      const initialOrg = await createOrganisation()
      const organisationId = initialOrg.id
      const start = new Date()

      const updateResponse = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${organisationId}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          version: initialOrg.version,
          updateFragment: {
            ...initialOrg,
            wasteProcessingTypes: ['reprocessor']
          }
        }
      })

      expect(updateResponse.statusCode).toBe(StatusCodes.OK)
      const updatedOrgResponseBody = JSON.parse(updateResponse.payload)

      const systemLogsResponse = await server.inject({
        method: 'GET',
        url: `/v1/system-logs/search?organisationId=${organisationId}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(systemLogsResponse.statusCode).toBe(StatusCodes.OK)

      const verifyCreatedBy = (payload) => {
        expect(payload.id).toEqual('test-user-id')
        expect(payload.email).toEqual('me@example.com')
        expect(payload.scope).toEqual([
          'admin.read',
          'admin.write',
          'admin.dlq.purge',
          'organisation.search',
          'organisation.read',
          'waste-balance.ledger.read',
          'summary-log.read'
        ])
      }

      const verifyEvent = (payload) => {
        expect(payload.event.category).toEqual('entity')
        expect(payload.event.subCategory).toEqual('epr-organisations')
        expect(payload.event.action).toEqual('update')
      }

      const verifyContext = (payload) => {
        expect(payload.context.organisationId).toEqual(organisationId)
        expect(payload.context.previous).toEqual(initialOrg)
        expect(payload.context.next).toEqual(updatedOrgResponseBody)
      }

      // System log
      const systemLogsResponseBody = JSON.parse(systemLogsResponse.payload)
      expect(systemLogsResponseBody.systemLogs).toHaveLength(1)
      const systemLogPayload = systemLogsResponseBody.systemLogs[0]
      verifyCreatedBy(systemLogPayload.createdBy)
      expect(
        new Date(systemLogPayload.createdAt).getTime()
      ).toBeGreaterThanOrEqual(start.getTime())
      verifyEvent(systemLogPayload)
      verifyContext(systemLogPayload)

      // CDP audit event
      expect(mockCdpAuditing).toHaveBeenCalledTimes(1)
      // stringify then parse to coerce Date objects to ISO strings
      const auditPayload = JSON.parse(
        JSON.stringify(mockCdpAuditing.mock.calls[0][0])
      )
      verifyCreatedBy(auditPayload.user)
      verifyEvent(auditPayload)
      verifyContext(auditPayload)
    })
  })

  describe('not found cases', () => {
    describe('when the orgId does not exist', async () => {
      let response
      beforeEach(async () => {
        const org = await createOrganisation()
        const nonExistentId = new ObjectId().toString()

        response = await server.inject({
          method: 'PUT',
          url: `/v1/organisations/${nonExistentId}`,
          headers: {
            Authorization: `Bearer ${validToken}`
          },
          payload: {
            version: org.version,
            updateFragment: { ...org, wasteProcessingTypes: ['reprocessor'] }
          }
        })
      })

      it('returns 404', async () => {
        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('includes Cache-Control header in error response', async () => {
        expect(response.headers['cache-control']).toBe(
          'no-cache, no-store, must-revalidate'
        )
      })
    })

    it('returns 404 when orgId is missing (whitespace-only path segment)', async () => {
      const org = buildOrganisation()

      const response = await server.inject({
        method: 'PUT',
        url: '/v1/organisations/%20%20%20',
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          version: org.version,
          updateFragment: { ...org, wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('invalid payload', () => {
    it('returns 400 when version field is missing', async () => {
      const org = await createOrganisation()

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          updateFragment: { ...org, wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(
        /Payload must include a numeric version field/
      )
    })

    it('returns 400 when version field is not a number', async () => {
      const org = await createOrganisation()

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          version: 'not-a-number',
          updateFragment: { ...org, wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(
        /Payload must include a numeric version field/
      )
    })

    it('returns 400 when updateFragment field is missing', async () => {
      const org = await createOrganisation()

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          version: org.version
        }
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(
        /Payload must include an updateFragment object/
      )
    })

    it('returns 400 when updateFragment is null', async () => {
      const org = await createOrganisation()

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          version: org.version,
          updateFragment: null
        }
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(
        /Payload must include an updateFragment object/
      )
    })

    it('returns 400 when updateFragment is not an object', async () => {
      const org = await createOrganisation()

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          version: org.version,
          updateFragment: 'not-an-object'
        }
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(
        /Payload must include an updateFragment object/
      )
    })
  })

  it('returns 409 when version number does not match current version', async () => {
    const org = await createOrganisation()

    const response = await server.inject({
      method: 'PUT',
      url: `/v1/organisations/${org.id}`,
      headers: {
        Authorization: `Bearer ${validToken}`
      },
      payload: {
        version: org.version + 1,
        updateFragment: { ...org, wasteProcessingTypes: ['reprocessor'] }
      }
    })

    expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(/Version conflict/)
  })

  it('includes validation error information in the response', async () => {
    const org = await createOrganisation()

    const response = await server.inject({
      method: 'PUT',
      url: `/v1/organisations/${org.id}`,
      headers: {
        Authorization: `Bearer ${validToken}`
      },
      payload: {
        version: org.version,
        updateFragment: { ...org, wasteProcessingTypes: [] }
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    const body = JSON.parse(response.payload)
    expect(body.message).toBe(
      'Invalid organisation data: wasteProcessingTypes: At least one waste processing type is required'
    )
  })

  testInvalidTokenScenarios({
    server: () => server,
    makeRequest: async () => {
      const org1 = await createOrganisation()
      return {
        method: 'PUT',
        url: `/v1/organisations/${org1.id}`,
        payload: {
          version: org1.version,
          updateFragment: { ...org1, wasteProcessingTypes: ['reprocessor'] }
        }
      }
    }
  })

  testOnlyServiceMaintainerCanAccess({
    server: () => server,
    makeRequest: async () => {
      const org1 = await createOrganisation()
      return {
        method: 'PUT',
        url: `/v1/organisations/${org1.id}`,
        payload: {
          version: org1.version,
          updateFragment: { ...org1, wasteProcessingTypes: ['reprocessor'] }
        }
      }
    }
  })

  describe('unexpected repository errors', () => {
    it('returns 500 when the repository throws a non-Boom error', async () => {
      const instance = createInMemoryOrganisationsRepository([])()
      const fixture = buildOrganisation()
      await instance.insert(fixture)

      const testServer = await createTestServer({
        repositories: {
          organisationsRepository: instance,
          systemLogsRepository: createSystemLogsRepository()
        }
      })

      const fetchResponse = await testServer.inject({
        method: 'GET',
        url: `/v1/organisations/${fixture.id}`,
        headers: { Authorization: `Bearer ${validToken}` }
      })
      const org = JSON.parse(fetchResponse.payload)

      instance.replace = async () => {
        throw new Error('unexpected repository failure')
      }

      const response = await testServer.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}`,
        headers: { Authorization: `Bearer ${validToken}` },
        payload: {
          version: org.version,
          updateFragment: { ...org, wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })
  })
})

describe('PUT /v1/organisations/{id} overseas sites validation', () => {
  setupAuthContext()
  let server
  let organisationsRepository

  const knownSiteId = new ObjectId().toString()

  const createOrgWithExporter = async () => {
    const fixture = buildOrganisation()
    await organisationsRepository.insert(fixture)

    const fetchResponse = await server.inject({
      method: 'GET',
      url: `/v1/organisations/${fixture.id}`,
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(fetchResponse.statusCode).toBe(StatusCodes.OK)
    return JSON.parse(fetchResponse.payload)
  }

  beforeEach(async () => {
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()

    const overseasSitesRepoFactory = createInMemoryOverseasSitesRepository([
      {
        id: knownSiteId,
        name: 'Test Reprocessing Site',
        address: {
          line1: '123 Rue de Test',
          townOrCity: 'Paris'
        },
        country: 'France',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ])

    server = await createTestServer({
      repositories: {
        organisationsRepository: organisationsRepositoryFactory,
        systemLogsRepository: createSystemLogsRepository(),
        overseasSitesRepository: overseasSitesRepoFactory
      }
    })
  })

  afterAll(() => {
    vi.resetAllMocks()
  })

  it('rejects overseasSiteId references that do not exist', async () => {
    const org = await createOrgWithExporter()
    const exporterReg = org.registrations.find(
      (r) => r.wasteProcessingType === 'exporter'
    )

    const updateFragment = prepareOrgUpdate(org, {
      registrations: [
        {
          ...exporterReg,
          overseasSites: {
            '001': { overseasSiteId: 'non-existent-site-id' }
          }
        }
      ]
    })

    const response = await server.inject({
      method: 'PUT',
      url: `/v1/organisations/${org.id}`,
      headers: { Authorization: `Bearer ${validToken}` },
      payload: {
        version: org.version,
        updateFragment
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    const body = JSON.parse(response.payload)
    expect(body.message).toContain('non-existent-site-id')
  })

  it('accepts valid overseasSiteId references', async () => {
    const org = await createOrgWithExporter()
    const exporterReg = org.registrations.find(
      (r) => r.wasteProcessingType === 'exporter'
    )

    const updateFragment = prepareOrgUpdate(org, {
      registrations: [
        {
          ...exporterReg,
          overseasSites: {
            '001': { overseasSiteId: knownSiteId }
          }
        }
      ]
    })

    const response = await server.inject({
      method: 'PUT',
      url: `/v1/organisations/${org.id}`,
      headers: { Authorization: `Bearer ${validToken}` },
      payload: {
        version: org.version,
        updateFragment
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const body = JSON.parse(response.payload)
    const updatedExporter = body.registrations.find(
      (r) => r.wasteProcessingType === 'exporter'
    )
    expect(updatedExporter.overseasSites).toEqual({
      '001': { overseasSiteId: knownSiteId }
    })
  })

  it('rejects when any overseasSiteId in a batch is invalid', async () => {
    const org = await createOrgWithExporter()
    const exporterReg = org.registrations.find(
      (r) => r.wasteProcessingType === 'exporter'
    )

    const updateFragment = prepareOrgUpdate(org, {
      registrations: [
        {
          ...exporterReg,
          overseasSites: {
            '001': { overseasSiteId: knownSiteId },
            '002': { overseasSiteId: 'bogus-id' }
          }
        }
      ]
    })

    const response = await server.inject({
      method: 'PUT',
      url: `/v1/organisations/${org.id}`,
      headers: { Authorization: `Bearer ${validToken}` },
      payload: {
        version: org.version,
        updateFragment
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    const body = JSON.parse(response.payload)
    expect(body.message).toContain('bogus-id')
    expect(body.message).not.toContain(knownSiteId)
  })

  it('allows update without registrations field', async () => {
    const org = await createOrgWithExporter()

    const { registrations: _, ...updateWithoutRegistrations } =
      prepareOrgUpdate(org, { wasteProcessingTypes: org.wasteProcessingTypes })

    const response = await server.inject({
      method: 'PUT',
      url: `/v1/organisations/${org.id}`,
      headers: { Authorization: `Bearer ${validToken}` },
      payload: {
        version: org.version,
        updateFragment: updateWithoutRegistrations
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
  })

  it('allows empty overseasSites map', async () => {
    const org = await createOrgWithExporter()
    const exporterReg = org.registrations.find(
      (r) => r.wasteProcessingType === 'exporter'
    )

    const updateFragment = prepareOrgUpdate(org, {
      registrations: [
        {
          ...exporterReg,
          overseasSites: {}
        }
      ]
    })

    const response = await server.inject({
      method: 'PUT',
      url: `/v1/organisations/${org.id}`,
      headers: { Authorization: `Bearer ${validToken}` },
      payload: {
        version: org.version,
        updateFragment
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
  })

  it('removing an overseasSites mapping does not delete the site record', async () => {
    const org = await createOrgWithExporter()
    const exporterReg = org.registrations.find(
      (r) => r.wasteProcessingType === 'exporter'
    )

    // First, add a mapping
    const addFragment = prepareOrgUpdate(org, {
      registrations: [
        {
          ...exporterReg,
          overseasSites: {
            '001': { overseasSiteId: knownSiteId }
          }
        }
      ]
    })

    const addResponse = await server.inject({
      method: 'PUT',
      url: `/v1/organisations/${org.id}`,
      headers: { Authorization: `Bearer ${validToken}` },
      payload: {
        version: org.version,
        updateFragment: addFragment
      }
    })

    expect(addResponse.statusCode).toBe(StatusCodes.OK)
    const updatedOrg = JSON.parse(addResponse.payload)

    // Now remove the mapping by sending empty overseasSites
    const updatedExporter = updatedOrg.registrations.find(
      (r) => r.wasteProcessingType === 'exporter'
    )
    const removeFragment = prepareOrgUpdate(updatedOrg, {
      registrations: [
        {
          ...updatedExporter,
          overseasSites: {}
        }
      ]
    })

    const removeResponse = await server.inject({
      method: 'PUT',
      url: `/v1/organisations/${updatedOrg.id}`,
      headers: { Authorization: `Bearer ${validToken}` },
      payload: {
        version: updatedOrg.version,
        updateFragment: removeFragment
      }
    })

    expect(removeResponse.statusCode).toBe(StatusCodes.OK)
    const finalOrg = JSON.parse(removeResponse.payload)
    const finalExporter = finalOrg.registrations.find(
      (r) => r.wasteProcessingType === 'exporter'
    )
    expect(finalExporter.overseasSites).toEqual({})

    // The overseas site record itself must still exist
    const siteResponse = await server.inject({
      method: 'GET',
      url: `/v1/overseas-sites/${knownSiteId}`,
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(siteResponse.statusCode).toBe(StatusCodes.OK)
    const site = JSON.parse(siteResponse.payload)
    expect(site.id).toBe(knownSiteId)
  })
})

describe('PUT /v1/organisations/{id} status change guard', () => {
  setupAuthContext()
  let server
  let organisationsRepository

  beforeEach(async () => {
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()

    server = await createTestServer({
      repositories: {
        organisationsRepository: organisationsRepositoryFactory,
        systemLogsRepository: createSystemLogsRepository()
      }
    })
  })

  afterAll(() => {
    vi.resetAllMocks()
  })

  const createOrganisation = async () => {
    const fixture = buildOrganisation()
    await organisationsRepository.insert(fixture)

    const fetchResponse = await server.inject({
      method: 'GET',
      url: `/v1/organisations/${fixture.id}`,
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(fetchResponse.statusCode).toBe(StatusCodes.OK)
    return JSON.parse(fetchResponse.payload)
  }

  const putOrganisation = (org, updateFragment) =>
    server.inject({
      method: 'PUT',
      url: `/v1/organisations/${org.id}`,
      headers: { Authorization: `Bearer ${validToken}` },
      payload: { version: org.version, updateFragment }
    })

  it('returns 422 when a registration status differs from its current status', async () => {
    const org = await createOrganisation()
    const registration = org.registrations[0]

    const response = await putOrganisation(
      org,
      prepareOrgUpdate(org, {
        registrations: [{ ...registration, status: 'rejected' }]
      })
    )

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    const body = JSON.parse(response.payload)
    expect(body.message).toBe(
      `Registration ${registration.id} status cannot be changed from created to rejected here — use the status transition actions`
    )
  })

  it('returns 422 when an accreditation status differs from its current status', async () => {
    const org = await createOrganisation()
    const accreditation = org.accreditations[0]

    const response = await putOrganisation(
      org,
      prepareOrgUpdate(org, {
        accreditations: [{ ...accreditation, status: 'rejected' }]
      })
    )

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    const body = JSON.parse(response.payload)
    expect(body.message).toBe(
      `Accreditation ${accreditation.id} status cannot be changed from created to rejected here — use the status transition actions`
    )
  })

  it('lists every offending item separated by "; "', async () => {
    const org = await createOrganisation()
    const registration = org.registrations[0]
    const accreditation = org.accreditations[0]

    const response = await putOrganisation(
      org,
      prepareOrgUpdate(org, {
        registrations: [{ ...registration, status: 'rejected' }],
        accreditations: [{ ...accreditation, status: 'rejected' }]
      })
    )

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    const body = JSON.parse(response.payload)
    expect(body.message).toBe(
      `Registration ${registration.id} status cannot be changed from created to rejected here — use the status transition actions; ` +
        `Accreditation ${accreditation.id} status cannot be changed from created to rejected here — use the status transition actions`
    )
  })

  it('returns 422 when a new registration carries a status other than created', async () => {
    const org = await createOrganisation()
    const newRegistration = buildRegistration({ status: 'rejected' })

    const response = await putOrganisation(
      org,
      prepareOrgUpdate(org, {
        registrations: [newRegistration]
      })
    )

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    const body = JSON.parse(response.payload)
    expect(body.message).toBe(
      `Registration ${newRegistration.id} status cannot be set to rejected here — new items start as created`
    )
  })

  // A new item may not carry a status history either — see the status history
  // guard suite below — so these fixtures leave the seeding to the repository.
  const buildNewRegistration = (overrides) => {
    const { statusHistory: _, ...registration } = buildRegistration(overrides)
    return registration
  }

  it('accepts a new registration with status created', async () => {
    const org = await createOrganisation()
    const newRegistration = buildNewRegistration({ status: 'created' })

    const response = await putOrganisation(
      org,
      prepareOrgUpdate(org, {
        registrations: [newRegistration]
      })
    )

    expect(response.statusCode).toBe(StatusCodes.OK)
  })

  it('accepts a new registration without a status', async () => {
    const org = await createOrganisation()
    const newRegistration = buildNewRegistration()

    const response = await putOrganisation(
      org,
      prepareOrgUpdate(org, {
        registrations: [newRegistration]
      })
    )

    expect(response.statusCode).toBe(StatusCodes.OK)
  })

  it('accepts an update that echoes current statuses unchanged', async () => {
    const org = await createOrganisation()

    const response = await putOrganisation(org, prepareOrgUpdate(org, {}))

    expect(response.statusCode).toBe(StatusCodes.OK)
  })

  it('accepts an updated item that omits status entirely', async () => {
    const org = await createOrganisation()
    const { status: _, ...registrationWithoutStatus } = org.registrations[0]

    const response = await putOrganisation(
      org,
      prepareOrgUpdate(org, {
        registrations: [registrationWithoutStatus]
      })
    )

    expect(response.statusCode).toBe(StatusCodes.OK)
  })
})

describe('PUT /v1/organisations/{id} status history guard', () => {
  setupAuthContext()

  const CREATED_AT = '2026-01-01T00:00:00.000Z'
  const APPROVED_AT = '2026-04-01T00:00:00.000Z'
  const SUSPENDED_AT = '2026-05-05T00:00:00.000Z'
  const CORRECTED_AT = '2026-05-01T00:00:00.000Z'

  /** @type {StatusHistoryEntry[]} */
  const CREATED_ONLY = [{ status: 'created', updatedAt: CREATED_AT }]
  /** @type {StatusHistoryEntry[]} */
  const SUSPENSION_HISTORY = [
    { status: 'created', updatedAt: CREATED_AT },
    { status: 'approved', updatedAt: APPROVED_AT },
    { status: 'suspended', updatedAt: SUSPENDED_AT }
  ]
  /** @type {StatusHistoryEntry[]} */
  const CANCELLATION_HISTORY = [
    { status: 'created', updatedAt: CREATED_AT },
    { status: 'approved', updatedAt: APPROVED_AT },
    { status: 'cancelled', updatedAt: SUSPENDED_AT }
  ]

  const getOrganisation = async (server, id) => {
    const response = await server.inject({
      method: 'GET',
      url: `/v1/organisations/${id}`,
      headers: { Authorization: `Bearer ${validToken}` }
    })
    expect(response.statusCode).toBe(StatusCodes.OK)
    return JSON.parse(response.payload)
  }

  const putOrganisation = (server, org, updateFragment) =>
    server.inject({
      method: 'PUT',
      url: `/v1/organisations/${org.id}`,
      headers: { Authorization: `Bearer ${validToken}` },
      payload: { version: org.version, updateFragment }
    })

  const withHistory = (item, statusHistory) => ({ ...item, statusHistory })

  const redated = (history, status, updatedAt) =>
    history.map((entry) =>
      entry.status === status ? { ...entry, updatedAt } : entry
    )

  const expectClause = (response, message) => {
    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(JSON.parse(response.payload).message).toBe(message)
  }

  /**
   * Seeds the in-memory repository with an organisation holding the given
   * stored status histories (insert() would overwrite them) and returns the
   * organisation as the admin editor sees it.
   */
  const seed = async ({
    registrationHistory = CREATED_ONLY,
    accreditationHistory = CREATED_ONLY
  } = {}) => {
    const fixture = /** @type {Organisation} */ (
      /** @type {unknown} */ (
        buildOrganisation({
          registrations: [
            buildRegistration({
              statusHistory: registrationHistory,
              registrationNumber: 'REG12345',
              validFrom: '2026-01-01',
              reprocessingType: 'input'
            })
          ],
          accreditations: [
            buildAccreditation({
              statusHistory: accreditationHistory,
              accreditationNumber: 'ACC12345',
              validFrom: '2026-01-01',
              validTo: '2027-01-01',
              reprocessingType: 'input'
            })
          ]
        })
      )
    )

    const server = await createTestServer({
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository([
          fixture
        ]),
        systemLogsRepository: createSystemLogsRepository()
      }
    })

    return { server, org: await getOrganisation(server, fixture.id) }
  }

  it('accepts a corrected accreditation suspension date and leaves the derived status alone', async () => {
    const { server, org } = await seed({
      accreditationHistory: SUSPENSION_HISTORY
    })
    const accreditation = org.accreditations[0]

    const response = await putOrganisation(
      server,
      org,
      prepareOrgUpdate(org, {
        accreditations: [
          withHistory(
            accreditation,
            redated(accreditation.statusHistory, 'suspended', CORRECTED_AT)
          )
        ]
      })
    )

    expect(response.statusCode).toBe(StatusCodes.OK)

    const reloaded = await getOrganisation(server, org.id)
    expect(reloaded.accreditations[0].status).toBe('suspended')
    expect(
      reloaded.accreditations[0].statusHistory.map((entry) => entry.updatedAt)
    ).toEqual([CREATED_AT, APPROVED_AT, CORRECTED_AT])
  })

  it('accepts a corrected registration cancellation date', async () => {
    const { server, org } = await seed({
      registrationHistory: CANCELLATION_HISTORY
    })
    const registration = org.registrations[0]

    const response = await putOrganisation(
      server,
      org,
      prepareOrgUpdate(org, {
        registrations: [
          withHistory(
            registration,
            redated(registration.statusHistory, 'cancelled', CORRECTED_AT)
          )
        ]
      })
    )

    expect(response.statusCode).toBe(StatusCodes.OK)

    const reloaded = await getOrganisation(server, org.id)
    expect(reloaded.registrations[0].status).toBe('cancelled')
    expect(
      reloaded.registrations[0].statusHistory.map((entry) => entry.updatedAt)
    ).toEqual([CREATED_AT, APPROVED_AT, CORRECTED_AT])
  })

  it('records a system log for a date correction', async () => {
    const { server, org } = await seed({
      accreditationHistory: SUSPENSION_HISTORY
    })
    const accreditation = org.accreditations[0]

    const response = await putOrganisation(
      server,
      org,
      prepareOrgUpdate(org, {
        accreditations: [
          withHistory(
            accreditation,
            redated(accreditation.statusHistory, 'suspended', CORRECTED_AT)
          )
        ]
      })
    )
    expect(response.statusCode).toBe(StatusCodes.OK)

    const systemLogsResponse = await server.inject({
      method: 'GET',
      url: `/v1/system-logs/search?organisationId=${org.id}`,
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(systemLogsResponse.statusCode).toBe(StatusCodes.OK)
    const { systemLogs } = JSON.parse(systemLogsResponse.payload)
    expect(systemLogs).toHaveLength(1)
    expect(systemLogs[0].event.action).toBe('update')
    expect(systemLogs[0].context.organisationId).toBe(org.id)
  })

  it('accepts a corrected status when the resulting sequence is valid', async () => {
    const { server, org } = await seed({
      accreditationHistory: SUSPENSION_HISTORY
    })
    const accreditation = org.accreditations[0]
    const [created, approved, suspended] = accreditation.statusHistory

    const response = await putOrganisation(
      server,
      org,
      prepareOrgUpdate(org, {
        accreditations: [
          withHistory(accreditation, [
            created,
            approved,
            { ...suspended, status: 'cancelled' }
          ])
        ]
      })
    )

    expect(response.statusCode).toBe(StatusCodes.OK)

    const reloaded = await getOrganisation(server, org.id)
    expect(reloaded.accreditations[0].status).toBe('cancelled')
    expect(
      reloaded.accreditations[0].statusHistory.map((entry) => entry.status)
    ).toEqual(['created', 'approved', 'cancelled'])
  })

  it('accepts a corrected registration status and derives the new current status', async () => {
    const { server, org } = await seed({
      registrationHistory: [
        { status: 'created', updatedAt: CREATED_AT },
        { status: 'approved', updatedAt: APPROVED_AT }
      ]
    })
    const registration = org.registrations[0]
    const [created, approved] = registration.statusHistory

    const response = await putOrganisation(
      server,
      org,
      prepareOrgUpdate(org, {
        registrations: [
          withHistory(registration, [
            created,
            { ...approved, status: 'rejected' }
          ])
        ]
      })
    )

    expect(response.statusCode).toBe(StatusCodes.OK)

    const reloaded = await getOrganisation(server, org.id)
    expect(reloaded.registrations[0].status).toBe('rejected')
  })

  it('accepts adjacent entries with the same status — a repeat is not a transition', async () => {
    const { server, org } = await seed({
      accreditationHistory: SUSPENSION_HISTORY
    })
    const accreditation = org.accreditations[0]
    const [created, approved, suspended] = accreditation.statusHistory

    const response = await putOrganisation(
      server,
      org,
      prepareOrgUpdate(org, {
        accreditations: [
          withHistory(accreditation, [
            created,
            approved,
            { ...suspended, status: 'approved' }
          ])
        ]
      })
    )

    expect(response.statusCode).toBe(StatusCodes.OK)

    const reloaded = await getOrganisation(server, org.id)
    expect(reloaded.accreditations[0].status).toBe('approved')
    expect(
      reloaded.accreditations[0].statusHistory.map((entry) => entry.status)
    ).toEqual(['created', 'approved', 'approved'])
  })

  it('accepts an unchanged echo of every status history', async () => {
    const { server, org } = await seed({
      accreditationHistory: SUSPENSION_HISTORY,
      registrationHistory: CANCELLATION_HISTORY
    })

    const response = await putOrganisation(server, org, prepareOrgUpdate(org))

    expect(response.statusCode).toBe(StatusCodes.OK)
  })

  it('accepts items whose fragment omits statusHistory entirely', async () => {
    const { server, org } = await seed({
      accreditationHistory: SUSPENSION_HISTORY
    })
    const { statusHistory: _, ...accreditationWithoutHistory } =
      org.accreditations[0]

    const response = await putOrganisation(
      server,
      org,
      prepareOrgUpdate(org, { accreditations: [accreditationWithoutHistory] })
    )

    expect(response.statusCode).toBe(StatusCodes.OK)
  })

  describe('stored history that already breaks the rules', () => {
    /** @type {StatusHistoryEntry[]} */
    const OUT_OF_ORDER_HISTORY = [
      { status: 'created', updatedAt: SUSPENDED_AT },
      { status: 'approved', updatedAt: APPROVED_AT }
    ]
    /** @type {StatusHistoryEntry[]} */
    const OFF_TABLE_HISTORY = [
      { status: 'created', updatedAt: CREATED_AT },
      { status: 'cancelled', updatedAt: APPROVED_AT }
    ]

    it('accepts an echo of out-of-order stored dates so the rest of the record stays editable', async () => {
      const { server, org } = await seed({
        registrationHistory: OUT_OF_ORDER_HISTORY
      })

      const response = await putOrganisation(server, org, prepareOrgUpdate(org))

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('accepts an echo of an off-table stored transition', async () => {
      const { server, org } = await seed({
        registrationHistory: OFF_TABLE_HISTORY
      })

      const response = await putOrganisation(server, org, prepareOrgUpdate(org))

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('returns 422 when a date on an off-table stored transition is edited', async () => {
      const { server, org } = await seed({
        registrationHistory: OFF_TABLE_HISTORY
      })
      const registration = org.registrations[0]

      const response = await putOrganisation(
        server,
        org,
        prepareOrgUpdate(org, {
          registrations: [
            withHistory(
              registration,
              redated(registration.statusHistory, 'cancelled', CORRECTED_AT)
            )
          ]
        })
      )

      expectClause(
        response,
        `Registration ${registration.id} status history contains an invalid transition from created to cancelled`
      )
    })

    it('accepts a date edit on a cascade-cancelled accreditation history', async () => {
      const { server, org } = await seed({
        accreditationHistory: CANCELLATION_HISTORY
      })
      const accreditation = org.accreditations[0]

      const response = await putOrganisation(
        server,
        org,
        prepareOrgUpdate(org, {
          accreditations: [
            withHistory(
              accreditation,
              redated(accreditation.statusHistory, 'cancelled', CORRECTED_AT)
            )
          ]
        })
      )

      expect(response.statusCode).toBe(StatusCodes.OK)
    })
  })

  describe('rejected edits', () => {
    const ENTRIES_FIXED_CLAUSE = (label, id) =>
      `${label} ${id} status history entries cannot be added or removed`

    it('returns 422 when an entry is added', async () => {
      const { server, org } = await seed({
        accreditationHistory: SUSPENSION_HISTORY
      })
      const accreditation = org.accreditations[0]

      const response = await putOrganisation(
        server,
        org,
        prepareOrgUpdate(org, {
          accreditations: [
            withHistory(accreditation, [
              ...accreditation.statusHistory,
              { status: 'cancelled', updatedAt: '2026-06-01T00:00:00.000Z' }
            ])
          ]
        })
      )

      expectClause(
        response,
        ENTRIES_FIXED_CLAUSE('Accreditation', accreditation.id)
      )
    })

    it('returns 422 when an entry is removed', async () => {
      const { server, org } = await seed({
        accreditationHistory: SUSPENSION_HISTORY
      })
      const accreditation = org.accreditations[0]

      const response = await putOrganisation(
        server,
        org,
        prepareOrgUpdate(org, {
          accreditations: [
            withHistory(accreditation, accreditation.statusHistory.slice(0, 2))
          ]
        })
      )

      expectClause(
        response,
        ENTRIES_FIXED_CLAUSE('Accreditation', accreditation.id)
      )
    })

    it('returns 422 when a changed status breaks the transition sequence', async () => {
      const { server, org } = await seed({
        accreditationHistory: SUSPENSION_HISTORY
      })
      const accreditation = org.accreditations[0]
      const [created, approved, suspended] = accreditation.statusHistory

      const response = await putOrganisation(
        server,
        org,
        prepareOrgUpdate(org, {
          accreditations: [
            withHistory(accreditation, [
              created,
              { ...approved, status: 'rejected' },
              suspended
            ])
          ]
        })
      )

      expectClause(
        response,
        `Accreditation ${accreditation.id} status history contains an invalid transition from rejected to suspended`
      )
    })

    it('returns 422 when the first entry is no longer created', async () => {
      const { server, org } = await seed({
        accreditationHistory: SUSPENSION_HISTORY
      })
      const accreditation = org.accreditations[0]
      const [created, ...rest] = accreditation.statusHistory

      const response = await putOrganisation(
        server,
        org,
        prepareOrgUpdate(org, {
          accreditations: [
            withHistory(accreditation, [
              { ...created, status: 'approved' },
              ...rest
            ])
          ]
        })
      )

      expectClause(
        response,
        `Accreditation ${accreditation.id} status history must start with created`
      )
    })

    it('returns 422 when entries are reordered', async () => {
      const { server, org } = await seed({
        accreditationHistory: SUSPENSION_HISTORY
      })
      const accreditation = org.accreditations[0]
      const [created, approved, suspended] = accreditation.statusHistory

      const response = await putOrganisation(
        server,
        org,
        prepareOrgUpdate(org, {
          accreditations: [
            withHistory(accreditation, [created, suspended, approved])
          ]
        })
      )

      expectClause(
        response,
        `Accreditation ${accreditation.id} status history dates must be in date order`
      )
    })

    it('returns 422 when updatedBy is added to an entry', async () => {
      const { server, org } = await seed({
        accreditationHistory: SUSPENSION_HISTORY
      })
      const accreditation = org.accreditations[0]
      const [created, ...rest] = accreditation.statusHistory

      const response = await putOrganisation(
        server,
        org,
        prepareOrgUpdate(org, {
          accreditations: [
            withHistory(accreditation, [
              { ...created, updatedBy: new ObjectId().toString() },
              ...rest
            ])
          ]
        })
      )

      expectClause(
        response,
        `Accreditation ${accreditation.id} status history updatedBy cannot be changed`
      )
    })

    it('returns 422 when the corrected dates are no longer ascending', async () => {
      const { server, org } = await seed({
        accreditationHistory: SUSPENSION_HISTORY
      })
      const accreditation = org.accreditations[0]

      const response = await putOrganisation(
        server,
        org,
        prepareOrgUpdate(org, {
          accreditations: [
            withHistory(
              accreditation,
              redated(accreditation.statusHistory, 'suspended', CREATED_AT)
            )
          ]
        })
      )

      expectClause(
        response,
        `Accreditation ${accreditation.id} status history dates must be in date order`
      )
    })

    it('returns 422 when adjacent corrected dates are equal', async () => {
      const { server, org } = await seed({
        accreditationHistory: SUSPENSION_HISTORY
      })
      const accreditation = org.accreditations[0]

      const response = await putOrganisation(
        server,
        org,
        prepareOrgUpdate(org, {
          accreditations: [
            withHistory(
              accreditation,
              redated(accreditation.statusHistory, 'suspended', APPROVED_AT)
            )
          ]
        })
      )

      expectClause(
        response,
        `Accreditation ${accreditation.id} status history dates must be in date order`
      )
    })

    it('returns 422 when a statusHistory is supplied for a new item', async () => {
      const { server, org } = await seed()
      const newRegistration = buildRegistration({
        statusHistory: CREATED_ONLY
      })

      const response = await putOrganisation(
        server,
        org,
        prepareOrgUpdate(org, { registrations: [newRegistration] })
      )

      expectClause(
        response,
        `Registration ${newRegistration.id} status history cannot be set on new items`
      )
    })

    it('lists a clause for every offending item separated by "; "', async () => {
      const { server, org } = await seed({
        registrationHistory: CANCELLATION_HISTORY,
        accreditationHistory: SUSPENSION_HISTORY
      })
      const registration = org.registrations[0]
      const accreditation = org.accreditations[0]

      const response = await putOrganisation(
        server,
        org,
        prepareOrgUpdate(org, {
          registrations: [
            withHistory(registration, registration.statusHistory.slice(0, 2))
          ],
          accreditations: [
            withHistory(
              accreditation,
              redated(accreditation.statusHistory, 'suspended', CREATED_AT)
            )
          ]
        })
      )

      expectClause(
        response,
        `${ENTRIES_FIXED_CLAUSE('Registration', registration.id)}; ` +
          `Accreditation ${accreditation.id} status history dates must be in date order`
      )
    })
  })
})
