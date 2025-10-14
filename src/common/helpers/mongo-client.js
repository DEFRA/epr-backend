import { MongoClient } from 'mongodb'

export const createMongoClient = async ({ url, options }) => {
  const mongoClient = await MongoClient.connect(url, {
    ...options
  })
  return mongoClient
}
