import { describe, it as base } from 'vitest'
import { createInMemoryPublicRegisterRepository } from './inmemory.js'
import { testPublicRegisterRepositoryContract } from './port.contract.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  publicRegisterRepository: async ({}, use) => {
    await use(
      createInMemoryPublicRegisterRepository({
        s3Bucket: 'test-bucket'
      })
    )
  }
})

describe('In-memory public register repository', () => {
  testPublicRegisterRepositoryContract(it)
})
