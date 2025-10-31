import { createInMemoryUploadsRepository } from './inmemory.js'
import { testUploadsRepositoryContract } from './port.contract.js'

describe('In-memory uploads repository', () => {
  testUploadsRepositoryContract(() => {
    const repository = createInMemoryUploadsRepository()

    // Set up test data
    repository.put(
      { bucket: 'test-bucket', key: 'path/to/summary-log.xlsx' },
      Buffer.from('test file content')
    )

    return repository
  })
})
