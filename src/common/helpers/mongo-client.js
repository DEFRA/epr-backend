import { MongoClient } from 'mongodb'

export const createMongoClient = async ({ url, options }) => {
  return await MongoClient.connect(url, {
    ...options
  })
}
