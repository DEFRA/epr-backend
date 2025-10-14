import { MongoClient } from 'mongodb'
import { createMongoClient } from './mongo-client.js'

vi.mock('mongodb')

const url = 'mongodb://localhost:27017'
const options = { maxPoolSize: 10 }

describe('createMongoClient', () => {
  let mongoClient

  beforeEach(() => {
    mongoClient = { db: vi.fn() }

    vi.mocked(MongoClient.connect).mockResolvedValue(mongoClient)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('should connect with expected url and options', async () => {
    await createMongoClient({ url, options })

    expect(MongoClient.connect).toHaveBeenCalledWith(url, options)
  })

  it('should return expected client', async () => {
    const result = await createMongoClient({ url, options })

    expect(result).toBe(mongoClient)
  })

  it('should connect with empty options when no options provided', async () => {
    await createMongoClient({ url })

    expect(MongoClient.connect).toHaveBeenCalledWith(url, {})
  })

  it('should throw expected error if connection fails', async () => {
    vi.mocked(MongoClient.connect).mockRejectedValue(
      new Error('Connection failed')
    )

    await expect(createMongoClient({ url, options })).rejects.toThrow(
      'Connection failed'
    )
  })
})
