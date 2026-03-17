import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'

import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrsImportsRepository } from '#overseas-sites/imports/repository/inmemory.js'
import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { ORS_IMPORT_STATUS } from '#overseas-sites/domain/import-status.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { orsImportCreatePath } from './post-import.js'

describe(`${orsImportCreatePath} route`, () => {
  setupAuthContext()

  describe('when feature flag is enabled', () => {
    let server
    let orsImportsRepository
    let uploadsRepository

    beforeAll(async () => {
      const factory = createInMemoryOrsImportsRepository()
      orsImportsRepository = factory()

      uploadsRepository = createInMemoryUploadsRepository()

      server = await createTestServer({
        repositories: {
          orsImportsRepository: () => orsImportsRepository,
          uploadsRepository
        },
        featureFlags: createInMemoryFeatureFlags({
          overseasSites: true
        })
      })
    })

    afterEach(() => {
      uploadsRepository.orsInitiateCalls.length = 0
    })

    afterAll(async () => {
      await server.stop()
    })

    describe('successful requests', () => {
      it('returns 201 with import ID, status and upload details', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/v1/overseas-sites/imports',
          ...asServiceMaintainer(),
          payload: {
            redirectUrl: 'https://admin.test/overseas-sites/upload'
          }
        })

        expect(response.statusCode).toBe(StatusCodes.CREATED)

        const body = JSON.parse(response.payload)
        expect(body.id).toBeDefined()
        expect(body.uploadId).toBeDefined()
        expect(body.status).toBe(ORS_IMPORT_STATUS.PREPROCESSING)
        expect(body.uploadUrl).toContain('upload-and-scan')
        expect(body.uploadUrl).toContain(body.uploadId)
        expect(body.statusUrl).toContain('status')
      })

      it('creates an import record in the repository', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/v1/overseas-sites/imports',
          ...asServiceMaintainer(),
          payload: {
            redirectUrl: 'https://admin.test/overseas-sites/upload'
          }
        })

        const body = JSON.parse(response.payload)
        const stored = await orsImportsRepository.findById(body.id)

        expect(stored).not.toBeNull()
        expect(stored.status).toBe(ORS_IMPORT_STATUS.PREPROCESSING)
        expect(stored.files).toEqual([])
      })

      it('initiates upload via CDP Uploader', async () => {
        await server.inject({
          method: 'POST',
          url: '/v1/overseas-sites/imports',
          ...asServiceMaintainer(),
          payload: {
            redirectUrl: 'https://admin.test/overseas-sites/upload'
          }
        })

        expect(uploadsRepository.orsInitiateCalls).toHaveLength(1)
        const call = uploadsRepository.orsInitiateCalls[0]
        expect(call.redirectUrl).toBe(
          'https://admin.test/overseas-sites/upload'
        )
        expect(call.callbackUrl).toContain('/v1/overseas-sites/imports/')
        expect(call.callbackUrl).toContain('/upload-completed')
      })

      it('generates unique import IDs for each request', async () => {
        const responses = await Promise.all([
          server.inject({
            method: 'POST',
            url: '/v1/overseas-sites/imports',
            ...asServiceMaintainer(),
            payload: { redirectUrl: 'https://admin.test/redirect' }
          }),
          server.inject({
            method: 'POST',
            url: '/v1/overseas-sites/imports',
            ...asServiceMaintainer(),
            payload: { redirectUrl: 'https://admin.test/redirect' }
          })
        ])

        const ids = responses.map((r) => JSON.parse(r.payload).id)
        expect(ids[0]).not.toBe(ids[1])
      })
    })

    describe('authorisation', () => {
      it('returns 401 when not authenticated', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/v1/overseas-sites/imports',
          payload: {
            redirectUrl: 'https://admin.test/redirect'
          }
        })

        expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
      })

      it('returns 403 when authenticated as standard user', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/v1/overseas-sites/imports',
          ...asStandardUser({ linkedOrgId: 'org-123' }),
          payload: {
            redirectUrl: 'https://admin.test/redirect'
          }
        })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      })
    })

    describe('payload validation', () => {
      it('returns 422 when redirectUrl is missing', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/v1/overseas-sites/imports',
          ...asServiceMaintainer(),
          payload: {}
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })
    })

    describe('error handling', () => {
      it('re-throws Boom errors from uploads repository', async () => {
        uploadsRepository.nextOrsImportError = Boom.badGateway(
          'CDP Uploader is down'
        )

        const response = await server.inject({
          method: 'POST',
          url: '/v1/overseas-sites/imports',
          ...asServiceMaintainer(),
          payload: {
            redirectUrl: 'https://admin.test/redirect'
          }
        })

        expect(response.statusCode).toBe(StatusCodes.BAD_GATEWAY)
      })

      it('returns 500 for unexpected errors', async () => {
        uploadsRepository.nextOrsImportError = new Error('Network failure')

        const response = await server.inject({
          method: 'POST',
          url: '/v1/overseas-sites/imports',
          ...asServiceMaintainer(),
          payload: {
            redirectUrl: 'https://admin.test/redirect'
          }
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      })
    })
  })
})
