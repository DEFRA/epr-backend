import { setup as setupMongo, teardown as teardownMongo } from 'vitest-mongodb'
import { MongoClient } from 'mongodb'

export async function setupRepositoryDb() {
  await setupMongo({
    binary: {
      version: 'latest'
    },
    serverOptions: {},
    autoStart: false
  })

  const mongoUri = globalThis.__MONGO_URI__
  process.env.MONGO_URI = mongoUri

  const mongoClient = await MongoClient.connect(mongoUri)
  const db = mongoClient.db(process.env.MONGO_DATABASE || 'epr-backend')

  return { db, mongoClient }
}

export async function teardownRepositoryDb(mongoClient) {
  if (mongoClient) {
    await mongoClient.close()
  }
  await teardownMongo()
}
