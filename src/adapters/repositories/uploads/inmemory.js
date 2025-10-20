import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export const BUCKET = 'test-bucket'
export const KEY = 'path/to/summary-log.xlsx'

/**
 * @returns {import('#domain/uploads/repository/port.js').UploadsRepository}
 */
export const createInMemoryUploadsRepository = () => {
  const fixturePromise = readFile(
    path.join(dirname, '../../../data/fixtures/uploads/reprocessor.xlsx')
  )

  return {
    async findByLocation({ bucket, key }) {
      if (this.error) {
        throw this.error
      }

      if (bucket === BUCKET && key === KEY) {
        return fixturePromise
      }

      return null
    }
  }
}
