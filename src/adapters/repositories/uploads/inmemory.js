/**
 * Creates an in-memory uploads repository for testing.
 * Files can be added using the put method.
 *
 * @param {Map<string, Buffer>} [initialData] - Optional initial data as a Map where keys are S3 URIs and values are Buffers
 * @returns {import('#domain/uploads/repository/port.js').UploadsRepository & { put: (uri: string, content: Buffer) => void }}
 */
export const createInMemoryUploadsRepository = (initialData = new Map()) => {
  const storage = new Map(initialData)

  return {
    async findByLocation(uri) {
      return storage.get(uri) ?? null
    },

    put(uri, content) {
      storage.set(uri, content)
    }
  }
}
