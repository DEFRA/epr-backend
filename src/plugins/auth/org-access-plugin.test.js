import { describe, it, expect, beforeEach, vi } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { orgAccessPlugin } from './org-access-plugin.js'
import { STATUS } from '#domain/organisations/model.js'

describe('orgAccessPlugin (production mode)', () => {
  let server
  let mockOrganisationsRepository
  let mockOrganisation

  beforeEach(async () => {
    const { default: Hapi } = await import('@hapi/hapi')
    server = Hapi.server()

    mockOrganisation = {
      id: 'org-123',
      status: STATUS.ACTIVE,
      users: [],
      version: 1
    }

    mockOrganisationsRepository = {
      findById: vi.fn().mockResolvedValue(mockOrganisation),
      update: vi.fn().mockResolvedValue(mockOrganisation)
    }

    // Mock auth scheme that returns credentials with linkedOrgId and tokenPayload
    server.auth.scheme('test', () => ({
      authenticate: (request, h) => {
        const linkedOrgId = request.headers['x-linked-org-id']
        const tokenPayload = request.headers['x-token-payload']
          ? JSON.parse(request.headers['x-token-payload'])
          : undefined

        if (!linkedOrgId && !request.headers['x-skip-linked-org']) {
          return h.unauthenticated(new Error('Missing auth'))
        }

        return h.authenticated({
          credentials: {
            id: request.headers.userid || 'test-user',
            linkedOrgId: linkedOrgId || undefined,
            tokenPayload
          }
        })
      }
    }))
    server.auth.strategy('test-strategy', 'test')

    // Attach mock repository to requests
    server.ext('onRequest', (request, h) => {
      request.organisationsRepository = mockOrganisationsRepository
      return h.continue
    })

    await server.register({
      plugin: orgAccessPlugin,
      options: {}
    })
  })

  describe('routes without organisationId param', () => {
    it('allows access to routes without organisationId', async () => {
      server.route({
        method: 'GET',
        path: '/health',
        options: { auth: false },
        handler: () => ({ status: 'ok' })
      })

      await server.initialize()
      const response = await server.inject({ method: 'GET', url: '/health' })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('skips org access check for routes without organisationId param', async () => {
      server.route({
        method: 'GET',
        path: '/me/profile',
        options: { auth: { strategy: 'test-strategy' } },
        handler: () => ({ profile: 'data' })
      })

      await server.initialize()
      const response = await server.inject({
        method: 'GET',
        url: '/me/profile',
        headers: {
          'x-linked-org-id': 'org-123',
          userid: 'alice'
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(mockOrganisationsRepository.findById).not.toHaveBeenCalled()
    })
  })

  describe('unauthenticated requests', () => {
    it('skips org access check when not authenticated', async () => {
      server.route({
        method: 'GET',
        path: '/organisations/{organisationId}/data',
        options: { auth: { strategy: 'test-strategy', mode: 'try' } },
        handler: () => ({ data: 'public' })
      })

      await server.initialize()
      // No auth headers - will cause h.unauthenticated() making isAuthenticated = false
      const response = await server.inject({
        method: 'GET',
        url: '/organisations/org-123/data'
      })

      // Auth failed (mode: try), plugin should skip org access check
      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(mockOrganisationsRepository.findById).not.toHaveBeenCalled()
    })
  })

  describe('credentials without linkedOrgId (Entra ID tokens)', () => {
    it('skips org access check when no linkedOrgId in credentials', async () => {
      server.route({
        method: 'GET',
        path: '/organisations/{organisationId}/admin',
        options: { auth: { strategy: 'test-strategy' } },
        handler: () => ({ admin: 'data' })
      })

      await server.initialize()
      await server.inject({
        method: 'GET',
        url: '/organisations/org-123/admin',
        headers: {
          'x-skip-linked-org': 'true',
          userid: 'admin-user'
        }
      })

      expect(mockOrganisationsRepository.findById).not.toHaveBeenCalled()
    })
  })

  describe('org mismatch check', () => {
    it('allows access when linkedOrgId matches organisationId param', async () => {
      server.route({
        method: 'GET',
        path: '/organisations/{organisationId}/data',
        options: { auth: { strategy: 'test-strategy' } },
        handler: () => ({ data: 'secret' })
      })

      await server.initialize()
      const response = await server.inject({
        method: 'GET',
        url: '/organisations/org-123/data',
        headers: {
          'x-linked-org-id': 'org-123',
          userid: 'alice'
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('denies access when linkedOrgId does not match organisationId param', async () => {
      server.route({
        method: 'GET',
        path: '/organisations/{organisationId}/data',
        options: { auth: { strategy: 'test-strategy' } },
        handler: () => ({ data: 'secret' })
      })

      await server.initialize()
      const response = await server.inject({
        method: 'GET',
        url: '/organisations/org-123/data',
        headers: {
          'x-linked-org-id': 'org-456', // Different org!
          userid: 'alice'
        }
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      expect(JSON.parse(response.payload).message).toBe(
        'Access denied: organisation mismatch'
      )
      // Should not fetch org if mismatch detected early
      expect(mockOrganisationsRepository.findById).not.toHaveBeenCalled()
    })
  })

  describe('org status check', () => {
    it.each([
      ['ACTIVE', STATUS.ACTIVE],
      ['SUSPENDED', STATUS.SUSPENDED]
    ])('allows access when organisation status is %s', async (_, status) => {
      mockOrganisation.status = status

      server.route({
        method: 'GET',
        path: '/organisations/{organisationId}/data',
        options: { auth: { strategy: 'test-strategy' } },
        handler: () => ({ data: 'secret' })
      })

      await server.initialize()
      const response = await server.inject({
        method: 'GET',
        url: '/organisations/org-123/data',
        headers: {
          'x-linked-org-id': 'org-123',
          userid: 'alice'
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it.each([
      ['CREATED', STATUS.CREATED],
      ['APPROVED', STATUS.APPROVED],
      ['REJECTED', STATUS.REJECTED],
      ['ARCHIVED', STATUS.ARCHIVED]
    ])('denies access when organisation status is %s', async (_, status) => {
      mockOrganisation.status = status

      server.route({
        method: 'GET',
        path: '/organisations/{organisationId}/data',
        options: { auth: { strategy: 'test-strategy' } },
        handler: () => ({ data: 'secret' })
      })

      await server.initialize()
      const response = await server.inject({
        method: 'GET',
        url: '/organisations/org-123/data',
        headers: {
          'x-linked-org-id': 'org-123',
          userid: 'alice'
        }
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      expect(JSON.parse(response.payload).message).toBe(
        'Access denied: organisation status not accessible'
      )
    })
  })

  describe('addStandardUserIfNotPresent', () => {
    it('adds user to organisation when tokenPayload is provided', async () => {
      const tokenPayload = {
        email: 'alice@example.com',
        firstName: 'Alice',
        lastName: 'Smith',
        contactId: 'contact-123'
      }

      server.route({
        method: 'GET',
        path: '/organisations/{organisationId}/data',
        options: { auth: { strategy: 'test-strategy' } },
        handler: () => ({ data: 'secret' })
      })

      await server.initialize()
      await server.inject({
        method: 'GET',
        url: '/organisations/org-123/data',
        headers: {
          'x-linked-org-id': 'org-123',
          userid: 'alice',
          'x-token-payload': JSON.stringify(tokenPayload)
        }
      })

      // Should call update to add user
      expect(mockOrganisationsRepository.update).toHaveBeenCalledWith(
        'org-123',
        1,
        expect.objectContaining({
          users: expect.arrayContaining([
            expect.objectContaining({
              email: 'alice@example.com',
              fullName: 'Alice Smith'
            })
          ])
        })
      )
    })

    it('does not add user when tokenPayload is not provided', async () => {
      server.route({
        method: 'GET',
        path: '/organisations/{organisationId}/data',
        options: { auth: { strategy: 'test-strategy' } },
        handler: () => ({ data: 'secret' })
      })

      await server.initialize()
      await server.inject({
        method: 'GET',
        url: '/organisations/org-123/data',
        headers: {
          'x-linked-org-id': 'org-123',
          userid: 'alice'
          // No x-token-payload header
        }
      })

      // Should not call update when no tokenPayload
      expect(mockOrganisationsRepository.update).not.toHaveBeenCalled()
    })
  })
})
