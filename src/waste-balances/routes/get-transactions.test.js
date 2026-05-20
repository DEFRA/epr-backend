import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createInMemoryWasteBalancesRepository } from '#waste-balances/repository/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { testOnlyServiceMaintainerCanAccess } from '#vite/helpers/test-invalid-roles-scenarios.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { wasteBalanceGetTransactionsPath } from './get-transactions.js'

const { validToken } = entraIdMockAuthTokens

const organisationId = '6507f1f77bcf86cd79943901'
const accreditationId = '507f1f77bcf86cd799439011'
const otherOrgId = '7777777777777777777777ff'
const nonExistentId = '000000000000000000000000'

const mockTransaction = {
  id: 'aaaaaaaaaaaaaaaaaaaaaa01',
  type: 'credit',
  createdAt: '2026-01-01T10:00:00.000Z',
  amount: 100,
  openingAmount: 0,
  closingAmount: 100,
  openingAvailableAmount: 0,
  closingAvailableAmount: 100,
  entities: []
}

const buildPath = (orgId, accId) =>
  wasteBalanceGetTransactionsPath
    .replace('{organisationId}', orgId)
    .replace('{accreditationId}', accId)

describe(`GET ${wasteBalanceGetTransactionsPath}`, () => {
  setupAuthContext()

  describe('happy path', () => {
    let server

    beforeEach(async () => {
      const wasteBalancesRepositoryFactory =
        createInMemoryWasteBalancesRepository(
          [
            {
              accreditationId,
              organisationId,
              amount: 100,
              availableAmount: 100,
              transactions: [mockTransaction],
              version: 1
            }
          ],
          { ledgerRepository: createInMemoryLedgerRepository()() }
        )

      server = await createTestServer({
        repositories: {
          wasteBalancesRepository: wasteBalancesRepositoryFactory
        },
        featureFlags: createInMemoryFeatureFlags({})
      })
    })

    it('returns 200 with the transactions array', async () => {
      const response = await server.inject({
        method: 'GET',
        url: buildPath(organisationId, accreditationId),
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        id: mockTransaction.id,
        type: 'credit',
        amount: 100
      })
    })

    it('returns an empty array when the balance has no transactions', async () => {
      const emptyAccreditationId = 'bbbbbbbbbbbbbbbbbbbbbbbb'
      const repo = createInMemoryWasteBalancesRepository(
        [
          {
            accreditationId: emptyAccreditationId,
            organisationId,
            amount: 0,
            availableAmount: 0,
            transactions: [],
            version: 1
          }
        ],
        { ledgerRepository: createInMemoryLedgerRepository()() }
      )

      const s = await createTestServer({
        repositories: { wasteBalancesRepository: repo },
        featureFlags: createInMemoryFeatureFlags({})
      })

      const response = await s.inject({
        method: 'GET',
        url: buildPath(organisationId, emptyAccreditationId),
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual([])
    })

    it('returns an empty array when the balance document has no transactions field', async () => {
      const legacyAccreditationId = 'cccccccccccccccccccccccc'
      const repo = createInMemoryWasteBalancesRepository(
        [
          {
            accreditationId: legacyAccreditationId,
            organisationId,
            amount: 0,
            availableAmount: 0,
            transactions: null,
            version: 1
          }
        ],
        { ledgerRepository: createInMemoryLedgerRepository()() }
      )

      const s = await createTestServer({
        repositories: { wasteBalancesRepository: repo },
        featureFlags: createInMemoryFeatureFlags({})
      })

      const response = await s.inject({
        method: 'GET',
        url: buildPath(organisationId, legacyAccreditationId),
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual([])
    })
  })

  describe('not found', () => {
    let server

    beforeEach(async () => {
      const repo = createInMemoryWasteBalancesRepository([], {
        ledgerRepository: createInMemoryLedgerRepository()()
      })
      server = await createTestServer({
        repositories: { wasteBalancesRepository: repo },
        featureFlags: createInMemoryFeatureFlags({})
      })
    })

    it('returns 404 when no waste balance exists for the accreditation', async () => {
      const response = await server.inject({
        method: 'GET',
        url: buildPath(organisationId, nonExistentId),
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      const result = JSON.parse(response.payload)
      expect(result.error).toBe('Not Found')
      expect(result.message).toContain(nonExistentId)
    })
  })

  describe('authorisation', () => {
    let server

    beforeEach(async () => {
      const repo = createInMemoryWasteBalancesRepository(
        [
          {
            accreditationId,
            organisationId: otherOrgId,
            amount: 500,
            availableAmount: 500,
            transactions: [mockTransaction],
            version: 1
          }
        ],
        { ledgerRepository: createInMemoryLedgerRepository()() }
      )
      server = await createTestServer({
        repositories: { wasteBalancesRepository: repo },
        featureFlags: createInMemoryFeatureFlags({})
      })
    })

    it('returns 403 when the accreditation belongs to a different organisation', async () => {
      const response = await server.inject({
        method: 'GET',
        url: buildPath(organisationId, accreditationId),
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      const result = JSON.parse(response.payload)
      expect(result.error).toBe('Forbidden')
      expect(result.message).toContain(accreditationId)
      expect(result.message).toContain(organisationId)
    })
  })

  describe('validation', () => {
    let server

    beforeEach(async () => {
      const repo = createInMemoryWasteBalancesRepository([], {
        ledgerRepository: createInMemoryLedgerRepository()()
      })
      server = await createTestServer({
        repositories: { wasteBalancesRepository: repo },
        featureFlags: createInMemoryFeatureFlags({})
      })
    })

    it('rejects an invalid organisationId format', async () => {
      const response = await server.inject({
        method: 'GET',
        url: buildPath('invalid-org', accreditationId),
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects an invalid accreditationId format', async () => {
      const response = await server.inject({
        method: 'GET',
        url: buildPath(organisationId, 'invalid-acc'),
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  describe('role-based access', () => {
    let server

    beforeEach(async () => {
      const repo = createInMemoryWasteBalancesRepository(
        [
          {
            accreditationId,
            organisationId,
            amount: 100,
            availableAmount: 100,
            transactions: [],
            version: 1
          }
        ],
        { ledgerRepository: createInMemoryLedgerRepository()() }
      )
      server = await createTestServer({
        repositories: { wasteBalancesRepository: repo },
        featureFlags: createInMemoryFeatureFlags({})
      })
    })

    testOnlyServiceMaintainerCanAccess({
      server: () => server,
      makeRequest: async () => ({
        method: 'GET',
        url: buildPath(organisationId, accreditationId)
      }),
      successStatus: StatusCodes.OK
    })

    testInvalidTokenScenarios({
      server: () => server,
      makeRequest: async () => ({
        method: 'GET',
        url: buildPath(organisationId, accreditationId)
      })
    })
  })
})
