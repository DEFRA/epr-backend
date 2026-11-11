import crypto from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import {
  buildLinkedDefraOrg,
  createOrganisationBuilders
} from '#repositories/organisations/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { testOnlyServiceMaintainerCanAccess } from '#vite/helpers/test-invalid-roles-scenarios.js'
import { linkedOrganisationsGetAllPath } from './get.js'

const { buildOrganisation } = createOrganisationBuilders()

const { validToken } = entraIdMockAuthTokens

describe(`GET ${linkedOrganisationsGetAllPath}`, () => {
  setupAuthContext()
  let server
  let organisationsRepositoryFactory
  let organisationAdministrationRepository

  beforeEach(async () => {
    organisationsRepositoryFactory = createInMemoryOrganisationsRepository([])
    organisationAdministrationRepository = organisationsRepositoryFactory()

    server = await createTestServer({
      repositories: {
        organisationAdministrationRepository: organisationsRepositoryFactory
      }
    })
  })

  it('returns 200 with only projected fields for linked organisations', async () => {
    const linkedDefraOrganisation = buildLinkedDefraOrg(
      crypto.randomUUID(),
      'Defra Org'
    )
    const linkedOrg = buildOrganisation({ linkedDefraOrganisation })
    const unlinkedOrg = buildOrganisation()

    await organisationAdministrationRepository.insert(linkedOrg)
    await organisationAdministrationRepository.insert(unlinkedOrg)

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
    expect(Object.keys(result[0]).sort()).toEqual([
      'companyDetails',
      'id',
      'linkedDefraOrganisation',
      'orgId',
      'status'
    ])
    expect(Object.keys(result[0].companyDetails)).toEqual(['name'])
    expect(result[0]).toEqual({
      id: linkedOrg.id,
      orgId: Number(linkedOrg.organisationNumber),
      companyDetails: {
        name: linkedOrg.companyDetails.name
      },
      status: 'created',
      linkedDefraOrganisation: {
        orgId: linkedDefraOrganisation.orgId,
        orgName: linkedDefraOrganisation.orgName,
        linkedBy: linkedDefraOrganisation.linkedBy,
        linkedAt: linkedDefraOrganisation.linkedAt
      }
    })
  })

  it('excludes sensitive fields from the response', async () => {
    const linkedOrg = buildOrganisation({
      linkedDefraOrganisation: buildLinkedDefraOrg(
        crypto.randomUUID(),
        'Defra Org'
      )
    })
    await organisationAdministrationRepository.insert(linkedOrg)

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
    expect(result[0]).not.toHaveProperty('users')
    expect(result[0]).not.toHaveProperty('registrations')
    expect(result[0]).not.toHaveProperty('accreditations')
    expect(result[0]).not.toHaveProperty('contactDetails')
    expect(result[0]).not.toHaveProperty('statusHistory')
  })

  it('returns 200 with empty array when no organisations are linked', async () => {
    const unlinkedOrg = buildOrganisation()
    await organisationAdministrationRepository.insert(unlinkedOrg)

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

    await organisationAdministrationRepository.insert(linkedOrg1)
    await organisationAdministrationRepository.insert(linkedOrg2)

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

    await organisationAdministrationRepository.insert(acmeOrg)
    await organisationAdministrationRepository.insert(betaOrg)

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
    await organisationAdministrationRepository.insert(linkedOrg)

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

  it('excludes test organisations from results', async () => {
    const testOrg = buildOrganisation({
      organisationNumber: toOrganisationNumber('999999'),
      linkedDefraOrganisation: buildLinkedDefraOrg(
        crypto.randomUUID(),
        'Test Org'
      )
    })
    const realOrg = buildOrganisation({
      linkedDefraOrganisation: buildLinkedDefraOrg(
        crypto.randomUUID(),
        'Real Org'
      )
    })

    await organisationAdministrationRepository.insert(testOrg)
    await organisationAdministrationRepository.insert(realOrg)

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
    expect(result[0].id).toBe(realOrg.id)
  })

  it('name filter is case-insensitive', async () => {
    const org = buildOrganisation({
      companyDetails: { name: 'Acme Ltd', registrationNumber: 'REG001' },
      linkedDefraOrganisation: buildLinkedDefraOrg(
        crypto.randomUUID(),
        'Defra Org'
      )
    })
    await organisationAdministrationRepository.insert(org)

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
    })
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
