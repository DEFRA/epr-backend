import { StatusCodes } from 'http-status-codes'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { ADMIN_ROLES, SCOPES } from '#common/helpers/auth/constants.js'
import { createTestServer } from '#test/create-test-server.js'
import {
  asServiceMaintainerRead,
  asServiceMaintainerWrite,
  asStandardUser,
  asSupport,
  asUnscopedAdminUser
} from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

const ADMIN_ME_PATH = '/v1/admin/me'

describe('GET /v1/admin/me', () => {
  setupAuthContext()

  let server

  beforeAll(async () => {
    server = await createTestServer({})
  })

  afterAll(async () => {
    await server.stop()
  })

  describe('access control matrix', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await server.inject({
        method: 'GET',
        url: ADMIN_ME_PATH
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 for an authenticated user with no admin tier', async () => {
      const response = await server.inject({
        method: 'GET',
        url: ADMIN_ME_PATH,
        ...asUnscopedAdminUser()
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('returns 403 for a Defra-side standard user', async () => {
      const response = await server.inject({
        method: 'GET',
        url: ADMIN_ME_PATH,
        ...asStandardUser({ linkedOrgId: 'org-123' })
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })

  describe('payload by tier', () => {
    it('returns the write tier role and full scope bundle', async () => {
      const response = await server.inject({
        method: 'GET',
        url: ADMIN_ME_PATH,
        ...asServiceMaintainerWrite()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({
        role: 'service_maintainer_write',
        scopes: [...ADMIN_ROLES.service_maintainer_write]
      })
    })

    it('returns the maintainer tier role and admin.read + admin.dlq.purge', async () => {
      const response = await server.inject({
        method: 'GET',
        url: ADMIN_ME_PATH,
        ...asServiceMaintainerRead()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({
        role: 'service_maintainer',
        scopes: [...ADMIN_ROLES.service_maintainer]
      })
    })

    it('returns the support tier role with only admin.read', async () => {
      const response = await server.inject({
        method: 'GET',
        url: ADMIN_ME_PATH,
        ...asSupport()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({
        role: 'support',
        scopes: [SCOPES.adminRead]
      })
    })

    it('does not surface the legacy service_maintainer scope in the response', async () => {
      // The JWT strategy adds the legacy `service_maintainer` Hapi scope to
      // write/maintainer credentials during the route re-scoping transition.
      // The /v1/admin/me payload must reflect only the documented SCOPES enum.
      const response = await server.inject({
        method: 'GET',
        url: ADMIN_ME_PATH,
        ...asServiceMaintainerWrite()
      })

      const payload = JSON.parse(response.payload)
      expect(payload.scopes).not.toContain('service_maintainer')
    })
  })
})
