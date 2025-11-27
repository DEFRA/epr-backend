import { describe, expect, vi } from 'vitest'
import { CreateBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { it as s3It } from '#vite/fixtures/s3.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { createUploadsRepository } from './s3.js'
import { testUploadsRepositoryFileContract } from './port.contract.js'

const bucket = 'test-bucket'
const key = 'path/to/summary-log.xlsx'

const testConfig = {
  cdpUploaderUrl: 'https://cdp-uploader.test',
  frontendUrl: 'https://frontend.test',
  backendUrl: 'https://backend.test',
  s3Bucket: 'test-bucket',
  maxFileSize: 10485760
}

const it = s3It.extend({
  s3Client: async ({ s3 }, use) => {
    const client = createS3Client({
      region: s3.region,
      endpoint: s3.endpoint,
      forcePathStyle: true,
      credentials: s3.credentials
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
    await use(
      createUploadsRepository({
        s3Client,
        ...testConfig
      })
    )
  }
})

describe('S3 uploads repository', () => {
  // Only run file contract tests - initiate requires external HTTP calls
  testUploadsRepositoryFileContract(it)

  describe('S3-specific error handling', () => {
    it('throws error when response.Body is undefined', async () => {
      const mockS3Client = {
        send: vi.fn().mockResolvedValue({ Body: undefined })
      }

      const repository = createUploadsRepository({
        s3Client: mockS3Client,
        ...testConfig
      })

      await expect(repository.findByLocation('s3://test/test')).rejects.toThrow(
        'S3 GetObject returned no body for s3://test/test'
      )
    })

    it('re-throws unexpected errors', async () => {
      const mockS3Client = {
        send: vi.fn().mockRejectedValue(new Error('Network error'))
      }

      const repository = createUploadsRepository({
        s3Client: mockS3Client,
        ...testConfig
      })

      await expect(repository.findByLocation('s3://test/test')).rejects.toThrow(
        'Network error'
      )
    })
  })
})
