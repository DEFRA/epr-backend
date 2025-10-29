import { createFormSubmissionsRepository } from './mongodb.js'
import { testFormSubmissionsRepositoryContract } from './port.contract.js'

const COLLECTION_NAME = 'organisation'

describe('MongoDB form submissions repository', () => {
  let server
  let formSubmissionsRepositoryFactory

  beforeAll(async () => {
    const { createServer } = await import('#server/server.js')
    server = await createServer()
    await server.initialize()

    formSubmissionsRepositoryFactory = createFormSubmissionsRepository(
      server.db
    )
  })

  afterAll(async () => {
    await server.stop()
  })

  beforeEach(async () => {
    await server.db.collection(COLLECTION_NAME).deleteMany({})
  })

  //TODO remove
  test('should initialize the repository factory', () => {
    expect(formSubmissionsRepositoryFactory).toBeDefined()
  })

  testFormSubmissionsRepositoryContract(async () => {
    const repository = formSubmissionsRepositoryFactory(server.logger)

    repository._insertTestData = async (data) => {
      if (data.length > 0) {
        await server.db.collection(COLLECTION_NAME).insertMany(data)
      }
    }

    return repository
  })
})
