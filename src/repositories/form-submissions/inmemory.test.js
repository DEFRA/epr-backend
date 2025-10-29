import { createFormSubmissionsRepository } from './inmemory.js'
import { testFormSubmissionsRepositoryContract } from './port.contract.js'

describe('In-memory form submissions repository', () => {
  const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }

  //TODO remove
  test('should create the repository', async () => {
    const repository = createFormSubmissionsRepository()(mockLogger)
    expect(repository).toBeDefined()
  })

  testFormSubmissionsRepositoryContract(async () => {
    const repository = createFormSubmissionsRepository()(mockLogger)
    const storage = repository._getStorage()

    // Helper method for testing
    repository._insertTestData = async (data) => {
      for (const doc of data) {
        storage.set(doc._id, doc)
      }
    }

    // Helper method for testing
    repository._clear = async () => {
      storage.clear()
    }

    await repository._clear()
    return repository
  })
})
