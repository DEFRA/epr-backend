import { describe, it as base, beforeEach, afterEach, expect } from 'vitest'
import { createInMemoryUploadsRepository } from './inmemory.js'
import { testUploadsRepositoryContract } from './port.contract.js'
import { createCallbackReceiver } from './test-helpers/callback-receiver.js'

/** @import { ContractTestFixtures } from './port.contract.js' */
/** @import { TestAPI } from 'vitest' */
/** @typedef {ContractTestFixtures & { uploadsRepository: ReturnType<typeof createInMemoryUploadsRepository> }} InMemoryFixtures */

let callbackReceiver

beforeEach(async () => {
  callbackReceiver = await createCallbackReceiver()
})

afterEach(async () => {
  if (callbackReceiver) {
    await callbackReceiver.stop()
  }
})

const it = /** @type {TestAPI<InMemoryFixtures>} */ (
  base.extend({
    // eslint-disable-next-line no-empty-pattern
    uploadsRepository: async ({}, use) => {
      await use(createInMemoryUploadsRepository())
    },

    performUpload: async (
      /** @type {{ uploadsRepository: InMemoryFixtures['uploadsRepository'] }} */
      { uploadsRepository },
      use
    ) => {
      await use(async (uploadId, buffer) => {
        await uploadsRepository.completeUpload(uploadId, buffer)
      })
    },

    // eslint-disable-next-line no-empty-pattern
    callbackReceiver: async ({}, use) => {
      await use(callbackReceiver)
    }
  })
)

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
