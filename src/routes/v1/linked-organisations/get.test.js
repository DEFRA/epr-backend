import crypto from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  buildLinkedDefraOrg,
  buildOrganisation
} from '#repositories/organisations/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { testOnlyServiceMaintainerCanAccess } from '#vite/helpers/test-invalid-roles-scenarios.js'
import { linkedOrganisationsGetAllPath } from './get.js'

const { validToken } = entraIdMockAuthTokens

describe(`GET ${linkedOrganisationsGetAllPath}`, () => {
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

  it('returns 200 with only linked organisations', async () => {
    const linkedOrg = buildOrganisation({
      linkedDefraOrganisation: buildLinkedDefraOrg(
        crypto.randomUUID(),
        'Defra Org'
      )
    })
    const unlinkedOrg = buildOrganisation()

    await organisationsRepository.insert(linkedOrg)
    await organisationsRepository.insert(unlinkedOrg)

    const response = await server.inject({
      method: 'GET',
      url: linkedOrganisationsGetAllPath,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(linkedOrg.id)
  })

  it('returns 200 with empty array when no organisations are linked', async () => {
    const unlinkedOrg = buildOrganisation()
    await organisationsRepository.insert(unlinkedOrg)

    const response = await server.inject({
      method: 'GET',
      url: linkedOrganisationsGetAllPath,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toEqual([])
  })

  it('returns all linked organisations when multiple exist', async () => {
    const linkedOrg1 = buildOrganisation({
      linkedDefraOrganisation: buildLinkedDefraOrg(
        crypto.randomUUID(),
        'Org One'
      )
    })
    const linkedOrg2 = buildOrganisation({
      linkedDefraOrganisation: buildLinkedDefraOrg(
        crypto.randomUUID(),
        'Org Two'
      )
    })

    await organisationsRepository.insert(linkedOrg1)
    await organisationsRepository.insert(linkedOrg2)

    const response = await server.inject({
      method: 'GET',
      url: linkedOrganisationsGetAllPath,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toHaveLength(2)
    expect(result.map((o) => o.id)).toEqual(
      expect.arrayContaining([linkedOrg1.id, linkedOrg2.id])
    )
  })

  it('filters by name query parameter', async () => {
    const acmeOrg = buildOrganisation({
      companyDetails: { name: 'Acme Ltd', registrationNumber: 'REG001' },
      linkedDefraOrganisation: buildLinkedDefraOrg(
        crypto.randomUUID(),
        'Defra One'
      )
    })
    const betaOrg = buildOrganisation({
      companyDetails: { name: 'Beta Corp', registrationNumber: 'REG002' },
      linkedDefraOrganisation: buildLinkedDefraOrg(
        crypto.randomUUID(),
        'Defra Two'
      )
    })

    await organisationsRepository.insert(acmeOrg)
    await organisationsRepository.insert(betaOrg)

    const response = await server.inject({
      method: 'GET',
      url: `${linkedOrganisationsGetAllPath}?name=acme`,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(acmeOrg.id)
  })

  it('returns empty array when name query matches nothing', async () => {
    const linkedOrg = buildOrganisation({
      linkedDefraOrganisation: buildLinkedDefraOrg(
        crypto.randomUUID(),
        'Defra Org'
      )
    })
    await organisationsRepository.insert(linkedOrg)

    const response = await server.inject({
      method: 'GET',
      url: `${linkedOrganisationsGetAllPath}?name=zzz`,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toEqual([])
  })

  it('name filter is case-insensitive', async () => {
    const org = buildOrganisation({
      companyDetails: { name: 'Acme Ltd', registrationNumber: 'REG001' },
      linkedDefraOrganisation: buildLinkedDefraOrg(
        crypto.randomUUID(),
        'Defra Org'
      )
    })
    await organisationsRepository.insert(org)

    const response = await server.inject({
      method: 'GET',
      url: `${linkedOrganisationsGetAllPath}?name=ACME`,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(org.id)
  })

  testInvalidTokenScenarios({
    server: () => server,
    makeRequest: async () => ({
      method: 'GET',
      url: linkedOrganisationsGetAllPath
    }),
    additionalExpectations: (response) => {
      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    }
  })

  testOnlyServiceMaintainerCanAccess({
    server: () => server,
    makeRequest: async () => ({
      method: 'GET',
      url: linkedOrganisationsGetAllPath
    }),
    successStatus: StatusCodes.OK
  })
})
