import { describe, it as base } from 'vitest'
import { createInMemoryUploadsRepository } from './inmemory.js'
import { testUploadsRepositoryContract } from './port.contract.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  uploadsRepository: async ({}, use) => {
    await use(createInMemoryUploadsRepository())
  },

  performUpload: async ({ uploadsRepository }, use) => {
    await use((uploadId, buffer) => {
      return uploadsRepository.completeUpload(uploadId, buffer)
    })
  }
})

describe('In-memory uploads repository', () => {
  testUploadsRepositoryContract(it)

  it('throws when completing upload with unknown uploadId', ({
    uploadsRepository
  }) => {
    expect(() => {
      uploadsRepository.completeUpload('unknown-id', Buffer.from('test'))
    }).toThrow('No pending upload found for uploadId: unknown-id')
  })
})
