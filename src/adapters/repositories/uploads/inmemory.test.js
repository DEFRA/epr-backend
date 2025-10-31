import { describe, beforeEach } from 'vitest'
import { createInMemoryUploadsRepository } from './inmemory.js'
import { testUploadsRepositoryContract } from './port.contract.js'

describe('In-memory uploads repository', () => {
  describe('uploads repository contract', () => {
    let repository

    beforeEach(() => {
      repository = createInMemoryUploadsRepository()

      // Set up test data
      repository.put(
        { bucket: 'test-bucket', key: 'path/to/summary-log.xlsx' },
        Buffer.from('test file content')
      )
    })

    testUploadsRepositoryContract(() => repository)
  })
})
