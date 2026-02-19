import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi
} from 'vitest'

import { config } from '#root/config.js'

import { createApiWasteOrganisationsService } from './api-adapter.js'

const currentYear = new Date().getFullYear()

const mockApiOrganisations = [
  {
    id: 'org-large-producer',
    name: 'Large Producer Ltd',
    tradingName: 'LP Trading',
    address: {
      addressLine1: '1 Test Street',
      town: 'Testville',
      postcode: 'T1 1TT'
    },
    registrations: [
      {
        type: 'LARGE_PRODUCER',
        registrationYear: currentYear,
        status: 'REGISTERED'
      }
    ]
  },
  {
    id: 'org-compliance-scheme',
    name: 'Scheme Operator Ltd',
    tradingName: 'Green Scheme',
    address: {
      addressLine1: '2 Scheme Road',
      town: 'Schemeton',
      postcode: 'S2 2SS'
    },
    registrations: [
      {
        type: 'COMPLIANCE_SCHEME',
        registrationYear: currentYear,
        status: 'REGISTERED'
      }
    ]
  },
  {
    id: 'org-no-trading-name',
    name: 'No Trading Name Ltd',
    tradingName: null,
    address: { addressLine1: '3 Plain Road', postcode: 'P3 3PP' },
    registrations: [
      {
        type: 'LARGE_PRODUCER',
        registrationYear: currentYear,
        status: 'REGISTERED'
      }
    ]
  }
]

const mockLogger = { warn: vi.fn() }

const apiUrl = 'http://waste-orgs-test.api'

const mswServer = setupServer(
  http.get(apiUrl, () => {
    return HttpResponse.json({ organisations: mockApiOrganisations })
  })
)

describe('#createApiWasteOrganisationsService', () => {
  beforeAll(() => {
    mswServer.listen({ onUnhandledRequest: 'error' })
    config.set('wasteOrganisationsApi.url', apiUrl)
    config.set('wasteOrganisationsApi.username', 'testuser')
    config.set('wasteOrganisationsApi.password', 'testpass')
    config.set('wasteOrganisationsApi.key', 'test-key')
    config.set('isDevelopment', true)
  })

  afterEach(() => {
    mswServer.resetHandlers()
    vi.clearAllMocks()
  })

  afterAll(() => {
    mswServer.close()
    config.reset('wasteOrganisationsApi.url')
    config.reset('wasteOrganisationsApi.username')
    config.reset('wasteOrganisationsApi.password')
    config.reset('wasteOrganisationsApi.key')
    config.reset('isDevelopment')
  })

  describe('#getOrganisationById', () => {
    it('returns the organisation with extracted registrationType when found', async () => {
      const service = createApiWasteOrganisationsService(mockLogger)
      const org = await service.getOrganisationById('org-large-producer')

      expect(org).toMatchObject({
        id: 'org-large-producer',
        name: 'Large Producer Ltd',
        tradingName: 'LP Trading',
        registrationType: 'LARGE_PRODUCER'
      })
    })

    it('returns compliance scheme with correct registrationType', async () => {
      const service = createApiWasteOrganisationsService(mockLogger)
      const org = await service.getOrganisationById('org-compliance-scheme')

      expect(org.registrationType).toBe('COMPLIANCE_SCHEME')
    })

    it('returns organisation without registrationType when it has no producer registrations', async () => {
      mswServer.use(
        http.get(apiUrl, () =>
          HttpResponse.json({
            organisations: [
              { id: 'org-no-regs', name: 'No Regs Ltd', address: {} }
            ]
          })
        )
      )

      const service = createApiWasteOrganisationsService(mockLogger)
      const org = await service.getOrganisationById('org-no-regs')

      expect(org).not.toHaveProperty('registrationType')
      expect(org).not.toHaveProperty('registrations')
    })

    it('does not include the raw registrations array in the result', async () => {
      const service = createApiWasteOrganisationsService(mockLogger)
      const org = await service.getOrganisationById('org-large-producer')

      expect(org).not.toHaveProperty('registrations')
    })

    it('returns null when the organisation is not found', async () => {
      const service = createApiWasteOrganisationsService(mockLogger)

      const result = await service.getOrganisationById('org-does-not-exist')
      expect(result).toBeNull()
    })

    it('sends correct basic auth header', async () => {
      let capturedHeaders = {}

      mswServer.use(
        http.get(apiUrl, ({ request }) => {
          capturedHeaders = Object.fromEntries(request.headers.entries())
          return HttpResponse.json({ organisations: mockApiOrganisations })
        })
      )

      const service = createApiWasteOrganisationsService(mockLogger)
      await service.getOrganisationById('org-large-producer')

      const expectedAuth = Buffer.from('testuser:testpass').toString('base64')
      expect(capturedHeaders.authorization).toBe(`Basic ${expectedAuth}`)
    })

    it('sends x-api-key header in development', async () => {
      let capturedHeaders = {}

      mswServer.use(
        http.get(apiUrl, ({ request }) => {
          capturedHeaders = Object.fromEntries(request.headers.entries())
          return HttpResponse.json({ organisations: mockApiOrganisations })
        })
      )

      const service = createApiWasteOrganisationsService(mockLogger)
      await service.getOrganisationById('org-large-producer')

      expect(capturedHeaders['x-api-key']).toBe('test-key')
    })

    it('does not send x-api-key header in production', async () => {
      config.set('isDevelopment', false)
      let capturedHeaders = {}

      mswServer.use(
        http.get(apiUrl, ({ request }) => {
          capturedHeaders = Object.fromEntries(request.headers.entries())
          return HttpResponse.json({ organisations: mockApiOrganisations })
        })
      )

      const service = createApiWasteOrganisationsService(mockLogger)
      await service.getOrganisationById('org-large-producer')
      config.set('isDevelopment', true)

      expect(capturedHeaders['x-api-key']).toBeUndefined()
    })

    it('logs a warning when an organisation has both LARGE_PRODUCER and COMPLIANCE_SCHEME registrations', async () => {
      mswServer.use(
        http.get(apiUrl, () =>
          HttpResponse.json({
            organisations: [
              {
                id: 'org-dual-reg',
                name: 'Dual Reg Ltd',
                address: {},
                registrations: [
                  {
                    type: 'LARGE_PRODUCER',
                    registrationYear: currentYear,
                    status: 'REGISTERED'
                  },
                  {
                    type: 'COMPLIANCE_SCHEME',
                    registrationYear: currentYear,
                    status: 'REGISTERED'
                  }
                ]
              }
            ]
          })
        )
      )

      const service = createApiWasteOrganisationsService(mockLogger)
      const org = await service.getOrganisationById('org-dual-reg')

      expect(org.registrationType).toBe('LARGE_PRODUCER')
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { organisationId: 'org-dual-reg', organisationName: 'Dual Reg Ltd' },
        expect.stringContaining('both LARGE_PRODUCER and COMPLIANCE_SCHEME')
      )
    })

    it('logs a warning when an organisation has no current-year producer registration', async () => {
      mswServer.use(
        http.get(apiUrl, () =>
          HttpResponse.json({
            organisations: [
              { id: 'org-no-regs', name: 'No Regs Ltd', address: {} }
            ]
          })
        )
      )

      const service = createApiWasteOrganisationsService(mockLogger)
      await service.getOrganisationById('org-no-regs')

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { organisationId: 'org-no-regs', organisationName: 'No Regs Ltd' },
        expect.stringContaining('no producer registration')
      )
    })

    it('throws Boom error if the API request fails', async () => {
      mswServer.use(http.get(apiUrl, () => HttpResponse.error()))

      const service = createApiWasteOrganisationsService(mockLogger)

      await expect(
        service.getOrganisationById('org-large-producer')
      ).rejects.toSatisfy((err) => err.isBoom && err.output.statusCode === 500)
    })
  })
})
