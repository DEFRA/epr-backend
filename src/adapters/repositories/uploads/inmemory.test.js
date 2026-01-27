import Hapi from '@hapi/hapi'
import { describe, it as base, beforeEach, afterEach, expect } from 'vitest'
import { createInMemoryUploadsRepository } from './inmemory.js'
import { testUploadsRepositoryContract } from './port.contract.js'
import { createCallbackReceiver } from './test-helpers/callback-receiver.js'
import { inMemoryUploadsRepositoryPlugin } from '#plugins/repositories/inmemory-uploads-repository-plugin.js'

let callbackReceiver

beforeEach(async () => {
  // Disable fetch mock for this test suite - we need real HTTP calls
  // eslint-disable-next-line no-undef
  fetchMock.disableMocks()

  callbackReceiver = await createCallbackReceiver()
})

afterEach(async () => {
  if (callbackReceiver) {
    await callbackReceiver.stop()
  }

  // Re-enable fetch mock after tests
  // eslint-disable-next-line no-undef
  fetchMock.enableMocks()
})

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  uploadsRepository: async ({}, use) => {
    await use(createInMemoryUploadsRepository())
  },

  performUpload: async ({ uploadsRepository }, use) => {
    await use(async (uploadId, buffer) => {
      await uploadsRepository.completeUpload(uploadId, buffer)
    })
  },

  // eslint-disable-next-line no-empty-pattern
  callbackReceiver: async ({}, use) => {
    await use(callbackReceiver)
  }
})

describe('In-memory uploads repository', () => {
  testUploadsRepositoryContract(it)

  it('throws when completing upload with unknown uploadId', async ({
    uploadsRepository
  }) => {
    await expect(
      uploadsRepository.completeUpload('unknown-id', Buffer.from('test'))
    ).rejects.toThrow('No pending upload found for uploadId: unknown-id')
  })

  describe('plugin wiring', () => {
    it('makes repository available on request via plugin', async () => {
      const server = Hapi.server()
      await server.register(inMemoryUploadsRepositoryPlugin)

      server.route({
        method: 'POST',
        path: '/test',
        options: { auth: false },
        handler: async (request) => {
          const result =
            await request.uploadsRepository.initiateSummaryLogUpload({
              organisationId: 'org-123',
              registrationId: 'reg-456',
              callbackUrl: 'http://localhost:9999/callback'
            })
          return {
            hasUploadUrl: !!result.uploadUrl,
            hasUploadId: !!result.uploadId
          }
        }
      })

      await server.initialize()
      const response = await server.inject({ method: 'POST', url: '/test' })
      const result = JSON.parse(response.payload)

      expect(result.hasUploadUrl).toBe(true)
      expect(result.hasUploadId).toBe(true)
    })
  })
})
