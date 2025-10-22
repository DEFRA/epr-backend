import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GetObjectCommand } from '@aws-sdk/client-s3'

import { createUploadsRepository } from './s3.js'

vi.mock('@aws-sdk/client-s3')

const bucket = 'test-bucket'
const key = 'test-key'

describe('S3 uploads repository', () => {
  let s3Client
  let repository

  beforeEach(() => {
    s3Client = {
      send: vi.fn().mockResolvedValue({
        Body: {
          transformToByteArray: vi
            .fn()
            .mockResolvedValue(new Uint8Array([1, 2, 3, 4, 5]))
        }
      })
    }

    repository = createUploadsRepository(s3Client)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('findByLocation', () => {
    it('should call s3 as expected', async () => {
      await repository.findByLocation({ bucket, key })

      expect(s3Client.send).toHaveBeenCalled()
      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: bucket,
        Key: key
      })
    })

    it('should return expected result', async () => {
      const result = await repository.findByLocation({ bucket, key })

      expect(result).toBeInstanceOf(Buffer)
      expect(result).toEqual(Buffer.from(new Uint8Array([1, 2, 3, 4, 5])))
    })

    it('should throw error when response.Body is undefined', async () => {
      s3Client.send.mockResolvedValue({ Body: undefined })

      await expect(repository.findByLocation({ bucket, key })).rejects.toThrow(
        `S3 GetObject returned no body for bucket=${bucket}, key=${key}`
      )
    })

    it('should return null when file does not exist (NoSuchKey error)', async () => {
      const error = new Error('The specified key does not exist')
      error.name = 'NoSuchKey'

      s3Client.send.mockRejectedValue(error)

      const result = await repository.findByLocation({ bucket, key })

      expect(result).toBeNull()
    })

    it('should return null when file does not exist (404 status code)', async () => {
      const error = new Error('Not found')
      error.$metadata = { httpStatusCode: 404 }

      s3Client.send.mockRejectedValue(error)

      const result = await repository.findByLocation({ bucket, key })

      expect(result).toBeNull()
    })

    it('should throw error for unexpected errors', async () => {
      const error = new Error('Network error')

      s3Client.send.mockRejectedValue(error)

      await expect(repository.findByLocation({ bucket, key })).rejects.toThrow(
        'Network error'
      )
    })
  })
})
