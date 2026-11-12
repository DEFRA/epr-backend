import { MongoBinary } from 'mongodb-memory-server'

import { images } from './fixtures/images.js'

/**
 * The tag of an image reference, without any digest: `mongo:7.0.28@sha256:...`
 * gives `7.0.28`.
 * @param {string} image
 */
const imageTag = (image) => image.split('@')[0].split(':').at(-1)

/**
 * Run the mongod binary matching the compose mongo image, and download it
 * once, before any test file can intercept the download with msw.
 */
export default async () => {
  process.env.MONGOMS_VERSION = imageTag(images.mongo)
  await MongoBinary.getPath()
}
