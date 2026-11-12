import { MongoBinary } from 'mongodb-memory-server'

/**
 * Download the mongod binary once, before any test file can intercept the
 * download with msw.
 */
export default async () => {
  await MongoBinary.getPath()
}
