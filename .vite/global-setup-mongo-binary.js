import { MongoBinary } from 'mongodb-memory-server'

import { imageTag, images } from './fixtures/images.js'

/**
 * Run the mongod binary matching the compose mongo image, and download it
 * once, before any test file can intercept the download with msw.
 */
export default async () => {
  process.env.MONGOMS_VERSION = imageTag(images.mongo)
  await MongoBinary.getPath()
}
