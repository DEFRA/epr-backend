import { MongoBinary } from 'mongodb-memory-server'

import { images } from './fixtures/images.js'

/**
 * Run the mongod binary matching the compose mongo image, and download it
 * once, before any test file can intercept the download with msw.
 */
export default async () => {
  process.env.MONGOMS_VERSION = images.mongo.replace(/^[^:]+:|@.*$/g, '')
  await MongoBinary.getPath()
}
