import { StatusCodes } from 'http-status-codes'

import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asOperator } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { wasteBalanceReportPath } from './report.js'

const CUTOFF_QUERY = '?cutoff=2026-06-30T23:00:00Z'

const orgWithAccreditation = ({
  id,
  orgId,
  registrationId,
  accreditationId,
  registrationNumber,
  accreditationNumber,
  material,
  wasteProcessingType
}) => ({
  id,
  orgId,
  registrations: [
    {
      id: registrationId,
      accreditationId,
      registrationNumber,
      material,
      wasteProcessingType
    }
  ],
  accreditations: [
    {
      id: accreditationId,
      status: 'approved',
      accreditationNumber,
      material,
      wasteProcessingType
    }
  ]
})

/**
 * @param {{ organisations?: object[], events?: object[] }} [options]
 */
const createServerWithRepos = async ({
  organisations = [],
  events = []
} = {}) => {
  const ledgerRepository = createInMemoryLedgerRepository()()
  for (const event of events) {
    await ledgerRepository.appendEvents([buildLedgerEvent(event)])
  }

  return createTestServer({
    repositories: {
      ledgerRepository,
      organisationsRepository: () => ({
        findAll: vi.fn().mockResolvedValue(organisations)
      })
    }
  })
}

describe(`GET ${wasteBalanceReportPath}`, () => {
  setupAuthContext()

  describe('route metadata', () => {
    it('lives at the documented admin path', () => {
      expect(wasteBalanceReportPath).toBe('/v1/admin/waste-balances/report')
    })
  })

  describe('happy path', () => {
    it('returns the documented shape: echoed cutoff, per-material totals, per-accreditation rows', async () => {
      const server = await createServerWithRepos({
        organisations: [
          orgWithAccreditation({
            id: 'org-a',
            orgId: 500001,
            registrationId: 'reg-a',
            accreditationId: 'acc-a',
            registrationNumber: 'REG-123',
            accreditationNumber: 'ACC-456',
            material: 'plastic',
            wasteProcessingType: 'reprocessor'
          })
        ],
        events: [
          {
            organisationId: 'org-a',
            registrationId: 'reg-a',
            accreditationId: 'acc-a',
            number: 1,
            closingBalance: { amount: 700, availableAmount: 500 },
            createdAt: new Date('2026-06-15T10:00:00.000Z')
          }
        ]
      })

      const response = await server.inject({
        method: 'GET',
        url: `${wasteBalanceReportPath}${CUTOFF_QUERY}`,
        ...asServiceMaintainer()
      })

      await server.stop()

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({
        cutoff: '2026-06-30T23:00:00.000Z',
        totals: [
          {
            material: 'plastic',
            wasteProcessingType: 'reprocessor',
            amount: 700,
            availableAmount: 500
          }
        ],
        accreditations: [
          {
            orgId: '500001',
            registrationNumber: 'REG-123',
            accreditationNumber: 'ACC-456',
            material: 'plastic',
            wasteProcessingType: 'reprocessor',
            amount: 700,
            availableAmount: 500
          }
        ]
      })
    })

    it('returns empty totals and accreditations when no organisations exist', async () => {
      const server = await createServerWithRepos()

      const response = await server.inject({
        method: 'GET',
        url: `${wasteBalanceReportPath}${CUTOFF_QUERY}`,
        ...asServiceMaintainer()
      })

      await server.stop()

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({
        cutoff: '2026-06-30T23:00:00.000Z',
        totals: [],
        accreditations: []
      })
    })
  })

  describe('cutoff validation', () => {
    it('rejects a missing cutoff', async () => {
      const server = await createServerWithRepos()

      const response = await server.inject({
        method: 'GET',
        url: wasteBalanceReportPath,
        ...asServiceMaintainer()
      })

      await server.stop()

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects a malformed cutoff', async () => {
      const server = await createServerWithRepos()

      const response = await server.inject({
        method: 'GET',
        url: `${wasteBalanceReportPath}?cutoff=not-a-date`,
        ...asServiceMaintainer()
      })

      await server.stop()

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  describe('auth', () => {
    it('returns 401 when no credentials are supplied', async () => {
      const server = await createServerWithRepos()

      const response = await server.inject({
        method: 'GET',
        url: `${wasteBalanceReportPath}${CUTOFF_QUERY}`
      })

      await server.stop()

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 when the caller is a standard user', async () => {
      const server = await createServerWithRepos()

      const response = await server.inject({
        method: 'GET',
        url: `${wasteBalanceReportPath}${CUTOFF_QUERY}`,
        ...asOperator()
      })

      await server.stop()

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })
})
