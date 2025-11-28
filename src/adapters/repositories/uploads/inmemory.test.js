import { describe, it as base, beforeEach, afterEach } from 'vitest'
import { createInMemoryUploadsRepository } from './inmemory.js'
import { testUploadsRepositoryContract } from './port.contract.js'
import { createCallbackReceiver } from './test-helpers/callback-receiver.js'

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
    await use(
      createInMemoryUploadsRepository({ backendUrl: callbackReceiver.url })
    )
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
})
