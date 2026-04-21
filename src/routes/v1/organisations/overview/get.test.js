import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { testOnlyServiceMaintainerCanAccess } from '#vite/helpers/test-invalid-roles-scenarios.js'
import { organisationsOverviewGetPath } from './get.js'

const { validToken } = entraIdMockAuthTokens

const makePath = (id) =>
  organisationsOverviewGetPath.replace('{organisationId}', id)

describe(`GET ${organisationsOverviewGetPath}`, () => {
  setupAuthContext()
  let server
  let organisationsRepositoryFactory
  let organisationsRepository

  beforeEach(async () => {
    organisationsRepositoryFactory = createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()

    server = await createTestServer({
      repositories: { organisationsRepository: organisationsRepositoryFactory }
    })
  })

  it('returns 200 with id and registrations array', async () => {
    const org = buildOrganisation()
    await organisationsRepository.insert(org)

    const response = await server.inject({
      method: 'GET',
      url: makePath(org.id),
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result.id).toBe(org.id)
    expect(Array.isArray(result.registrations)).toBe(true)
  })

  it('returns only id, companyName, and registrations fields at the top level', async () => {
    const org = buildOrganisation()
    await organisationsRepository.insert(org)

    const response = await server.inject({
      method: 'GET',
      url: makePath(org.id),
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(Object.keys(result).sort()).toEqual([
      'companyName',
      'id',
      'registrations'
    ])
  })

  it('returns companyName from organisation companyDetails', async () => {
    const org = buildOrganisation()
    await organisationsRepository.insert(org)

    const response = await server.inject({
      method: 'GET',
      url: makePath(org.id),
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result.companyName).toBe(org.companyDetails.name)
  })

  it('returns registrations with the expected fields', async () => {
    const registration = buildRegistration({
      registrationNumber: 'RERE0001'
    })
    const org = buildOrganisation({ registrations: [registration] })
    await organisationsRepository.insert(org)

    const response = await server.inject({
      method: 'GET',
      url: makePath(org.id),
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result.registrations).toHaveLength(1)
    const reg = result.registrations[0]
    expect(Object.keys(reg).sort()).toEqual([
      'id',
      'material',
      'processingType',
      'registrationNumber',
      'site',
      'status'
    ])
    expect(reg.id).toBe(registration.id)
    expect(reg.registrationNumber).toBe('RERE0001')
    expect(reg.status).toBe('created')
  })

  it('does not leak any other registration fields', async () => {
    const org = buildOrganisation()
    await organisationsRepository.insert(org)

    const response = await server.inject({
      method: 'GET',
      url: makePath(org.id),
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    const allowedKeys = new Set([
      'id',
      'material',
      'processingType',
      'registrationNumber',
      'site',
      'status',
      'accreditation'
    ])
    for (const reg of result.registrations) {
      expect(Object.keys(reg).every((k) => allowedKeys.has(k))).toBe(true)
    }
  })

  it('returns processingType of "reprocessor - input" for a reprocessor with reprocessingType input', async () => {
    const registration = buildRegistration({
      wasteProcessingType: 'reprocessor',
      reprocessingType: 'input'
    })
    const org = buildOrganisation({ registrations: [registration] })
    await organisationsRepository.insert(org)

    const response = await server.inject({
      method: 'GET',
      url: makePath(org.id),
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result.registrations[0].processingType).toBe('reprocessor - input')
  })

  it('returns processingType of "reprocessor - output" for a reprocessor with reprocessingType output', async () => {
    const registration = buildRegistration({
      wasteProcessingType: 'reprocessor',
      reprocessingType: 'output'
    })
    const org = buildOrganisation({ registrations: [registration] })
    await organisationsRepository.insert(org)

    const response = await server.inject({
      method: 'GET',
      url: makePath(org.id),
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result.registrations[0].processingType).toBe('reprocessor - output')
  })

  it('returns processingType of "exporter" for an exporter', async () => {
    const registration = buildRegistration({ wasteProcessingType: 'exporter' })
    const org = buildOrganisation({ registrations: [registration] })
    await organisationsRepository.insert(org)

    const response = await server.inject({
      method: 'GET',
      url: makePath(org.id),
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result.registrations[0].processingType).toBe('exporter')
  })

  it('returns site address line1 for a reprocessor', async () => {
    const registration = buildRegistration({
      wasteProcessingType: 'reprocessor'
    })
    const org = buildOrganisation({ registrations: [registration] })
    await organisationsRepository.insert(org)

    const response = await server.inject({
      method: 'GET',
      url: makePath(org.id),
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result.registrations[0].site).toBe(registration.site.address.line1)
  })

  it('returns null site for an exporter', async () => {
    const registration = buildRegistration({ wasteProcessingType: 'exporter' })
    const org = buildOrganisation({ registrations: [registration] })
    await organisationsRepository.insert(org)

    const response = await server.inject({
      method: 'GET',
      url: makePath(org.id),
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result.registrations[0].site).toBeNull()
  })

  it('includes linked accreditation with id, accreditationNumber, and status', async () => {
    const accreditation = buildAccreditation({ accreditationNumber: 'ACC0001' })
    const registration = buildRegistration({
      accreditationId: accreditation.id
    })
    const org = buildOrganisation({
      registrations: [registration],
      accreditations: [accreditation]
    })
    await organisationsRepository.insert(org)

    const response = await server.inject({
      method: 'GET',
      url: makePath(org.id),
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    const reg = result.registrations[0]
    expect(reg.accreditation).toBeDefined()
    expect(Object.keys(reg.accreditation).sort()).toEqual([
      'accreditationNumber',
      'id',
      'status'
    ])
    expect(reg.accreditation.id).toBe(accreditation.id)
    expect(reg.accreditation.accreditationNumber).toBe('ACC0001')
    expect(reg.accreditation.status).toBe('created')
  })

  it('does not include accreditation on registration when none is linked', async () => {
    const registration = buildRegistration()
    delete registration.accreditationId
    const org = buildOrganisation({
      registrations: [registration],
      accreditations: []
    })
    await organisationsRepository.insert(org)

    const response = await server.inject({
      method: 'GET',
      url: makePath(org.id),
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result.registrations[0]).not.toHaveProperty('accreditation')
  })

  it('returns 404 when the organisation does not exist', async () => {
    const response = await server.inject({
      method: 'GET',
      url: makePath('nonexistent-id'),
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('returns 404 when organisationId is whitespace-only', async () => {
    const response = await server.inject({
      method: 'GET',
      url: makePath('%20%20%20'),
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  describe('Authentication', () => {
    it('returns 401 when not authenticated', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'GET',
        url: makePath(org.id)
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 when user is not a service maintainer', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'GET',
        url: makePath(org.id),
        headers: {
          Authorization: `Bearer ${entraIdMockAuthTokens.nonServiceMaintainerUserToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })

  testInvalidTokenScenarios({
    server: () => server,
    makeRequest: async () => ({
      method: 'GET',
      url: makePath('some-org-id')
    })
  })

  testOnlyServiceMaintainerCanAccess({
    server: () => server,
    makeRequest: async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)
      return {
        method: 'GET',
        url: makePath(org.id)
      }
    },
    successStatus: StatusCodes.OK
  })
})
