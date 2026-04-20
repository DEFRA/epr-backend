import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { asStandardUser } from '#test/inject-auth.js'
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
      repositories: { organisationsRepository: organisationsRepositoryFactory },
      featureFlags: createInMemoryFeatureFlags({ reports: true })
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

  it('returns registrations with id, registrationNumber, and status only', async () => {
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
      'registrationNumber',
      'reports',
      'status'
    ])
    expect(reg.id).toBe(registration.id)
    expect(reg.registrationNumber).toBe('RERE0001')
    expect(reg.status).toBe('created')
  })

  it('does not leak any other registration fields beyond id, registrationNumber, status, and accreditation', async () => {
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
      'registrationNumber',
      'status',
      'accreditation',
      'reports'
    ])
    for (const reg of result.registrations) {
      expect(Object.keys(reg).every((k) => allowedKeys.has(k))).toBe(true)
    }
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

  it('includes reports from the calendar endpoint on each registration', async () => {
    const org = buildOrganisation()
    await organisationsRepository.insert(org)

    const response = await server.inject({
      method: 'GET',
      url: makePath(org.id),
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    for (const reg of result.registrations) {
      expect(reg).toHaveProperty('reports')
      expect(reg.reports).toHaveProperty('cadence')
      expect(reg.reports).toHaveProperty('reportingPeriods')
      expect(Array.isArray(reg.reports.reportingPeriods)).toBe(true)
    }
  })

  it('sets reports to null when the calendar endpoint returns non-200', async () => {
    const registration = buildRegistration()
    const org = buildOrganisation({ registrations: [registration] })
    await organisationsRepository.insert(org)

    // Disable the reports feature flag so the calendar route is not registered
    const serverWithoutReports = await createTestServer({
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository([org])
      },
      featureFlags: createInMemoryFeatureFlags({ reports: false })
    })

    const response = await serverWithoutReports.inject({
      method: 'GET',
      url: makePath(org.id),
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result.registrations[0].reports).toBeNull()
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

  it('returns 403 when called as a standard user', async () => {
    const org = buildOrganisation()
    await organisationsRepository.insert(org)

    const response = await server.inject({
      method: 'GET',
      url: makePath(org.id),
      ...asStandardUser({ linkedOrgId: org.id })
    })

    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
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
