import { describe, expect, vi } from 'vitest'
import { CreateBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { it as s3It } from '#vite/fixtures/s3.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { createUploadsRepository } from './s3.js'
import { testUploadsRepositoryContract } from './port.contract.js'

const bucket = 'test-bucket'
const key = 'path/to/summary-log.xlsx'

const it = s3It.extend({
  s3Client: async ({ s3 }, use) => {
    const client = createS3Client({
      region: 'us-east-1',
      endpoint: s3,
      forcePathStyle: true,
      credentials: {
        accessKeyId: globalThis.__S3_ACCESS_KEY__,
        secretAccessKey: globalThis.__S3_SECRET_KEY__
      }
    })

    try {
      await client.send(
        new CreateBucketCommand({
          Bucket: bucket
        })
      )
    } catch (error) {
      if (error.name !== 'BucketAlreadyOwnedByYou') {
        throw error
      }
    }

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.from('test file content')
      })
    )

    await use(client)
    client.destroy()
  },

  uploadsRepository: async ({ s3Client }, use) => {
    await use(createUploadsRepository(s3Client))
  }
})

describe('S3 uploads repository', () => {
  testUploadsRepositoryContract(it)

  describe('S3-specific error handling', () => {
    it('throws error when response.Body is undefined', async () => {
      const mockS3Client = {
        send: vi.fn().mockResolvedValue({ Body: undefined })
      }

      const repository = createUploadsRepository(mockS3Client)

      await expect(
        repository.findByLocation({ bucket: 'test', key: 'test' })
      ).rejects.toThrow(
        'S3 GetObject returned no body for bucket=test, key=test'
      )
    })

    it('re-throws unexpected errors', async () => {
      const mockS3Client = {
        send: vi.fn().mockRejectedValue(new Error('Network error'))
      }

      const repository = createUploadsRepository(mockS3Client)

      await expect(
        repository.findByLocation({ bucket: 'test', key: 'test' })
      ).rejects.toThrow('Network error')
    })
  })
})
