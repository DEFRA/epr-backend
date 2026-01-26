import { describe, it as base, expect } from 'vitest'
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

  it('throws when fetching from URL for non-existent file', async ({
    publicRegisterRepository
  }) => {
    const fakeUrl =
      'https://re-ex-public-register.test/test-bucket/non-existent.csv/pre-signed-url'

    await expect(
      publicRegisterRepository.fetchFromPresignedUrl(fakeUrl)
    ).rejects.toThrow('Pre signed url not found')
  })

  it('throws when generating presigned URL for non-existent file', async ({
    publicRegisterRepository
  }) => {
    await expect(
      publicRegisterRepository.generatePresignedUrl('non-existent.csv')
    ).rejects.toThrow('File not found')
  })
})
