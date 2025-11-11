import { describe, it as base } from 'vitest'
import { createInMemoryUploadsRepository } from './inmemory.js'
import { testUploadsRepositoryContract } from './port.contract.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  uploadsRepository: async ({}, use) => {
    const repository = createInMemoryUploadsRepository()

    // Set up test data
    repository.put(
      's3://test-bucket/path/to/summary-log.xlsx',
      Buffer.from('test file content')
    )

    await use(repository)
  }
})

describe('In-memory uploads repository', () => {
  describe('uploads repository contract', () => {
    testUploadsRepositoryContract(it)
  })
})
