/**
 * @typedef {Object} StorageLocation
 * @property {string} bucket
 * @property {string} key
 */

/**
 * Creates an in-memory uploads repository for testing.
 * Files can be added using the put method.
 *
 * @param {Map<string, Buffer>} [initialData] - Optional initial data as a Map where keys are "bucket:key" and values are Buffers
 * @returns {import('#domain/uploads/repository/port.js').UploadsRepository & { put: (location: StorageLocation, content: Buffer) => void }}
 */
export const createInMemoryUploadsRepository = (initialData = new Map()) => {
  const storage = new Map(initialData)

  const makeKey = (bucket, key) => `${bucket}:${key}`

  return {
    async findByLocation({ bucket, key }) {
      const storageKey = makeKey(bucket, key)
      return storage.get(storageKey) || null
    },

    put({ bucket, key }, content) {
      const storageKey = makeKey(bucket, key)
      storage.set(storageKey, content)
    }
  }
}
