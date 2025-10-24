import { describe, it, expect } from 'vitest'
import {
  createInMemoryUploadsRepository,
  BUCKET,
  KEY
} from './inmemory.js'

describe('InMemoryUploadsRepository', () => {
  describe('findByLocation', () => {
    it('should return fixture when bucket and key match', async () => {
      const repository = createInMemoryUploadsRepository()
      const result = await repository.findByLocation({ bucket: BUCKET, key: KEY })

      expect(result).toBeDefined()
      expect(Buffer.isBuffer(result)).toBe(true)
    })

    it('should return null when bucket or key do not match', async () => {
      const repository = createInMemoryUploadsRepository()
      const result = await repository.findByLocation({
        bucket: 'wrong-bucket',
        key: 'wrong-key'
      })

      expect(result).toBeNull()
    })

    it('should throw error when config.throwError is set', async () => {
      const testError = new Error('Test error')
      const repository = createInMemoryUploadsRepository({
        throwError: testError
      })

      await expect(
        repository.findByLocation({ bucket: BUCKET, key: KEY })
      ).rejects.toThrow('Test error')
    })
  })
})
