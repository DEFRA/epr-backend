import { StatusCodes } from 'http-status-codes'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { SCOPES } from '#common/helpers/auth/constants.js'
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
    it('returns the write tier scope bundle (admin.read + admin.write + admin.dlq.purge)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: ADMIN_ME_PATH,
        ...asServiceMaintainerWrite()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({
        scopes: [SCOPES.adminRead, SCOPES.adminWrite, SCOPES.adminDlqPurge]
      })
    })

    it('returns the maintainer tier scope bundle (admin.read + admin.dlq.purge)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: ADMIN_ME_PATH,
        ...asServiceMaintainerRead()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({
        scopes: [SCOPES.adminRead, SCOPES.adminDlqPurge]
      })
    })

    it('returns the support tier scope bundle (admin.read only)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: ADMIN_ME_PATH,
        ...asSupport()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toEqual({
        scopes: [SCOPES.adminRead]
      })
    })
  })
})
