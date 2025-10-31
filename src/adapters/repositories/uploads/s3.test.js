import {
  afterAll,
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest'
import { CreateBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { startS3Server, stopS3Server } from '#vite/fixtures/s3.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { createUploadsRepository } from './s3.js'
import { testUploadsRepositoryContract } from './port.contract.js'

const bucket = 'test-bucket'
const key = 'path/to/summary-log.xlsx'

describe('S3 uploads repository', () => {
  let s3Client

  beforeAll(async () => {
    await startS3Server()
  })

  afterAll(async () => {
    await stopS3Server()
  })

  beforeEach(async () => {
    s3Client = createS3Client({
      region: 'us-east-1',
      endpoint: globalThis.__S3_ENDPOINT__,
      forcePathStyle: true,
      credentials: {
        accessKeyId: globalThis.__S3_ACCESS_KEY__,
        secretAccessKey: globalThis.__S3_SECRET_KEY__
      }
    })

    try {
      await s3Client.send(
        new CreateBucketCommand({
          Bucket: bucket
        })
      )
    } catch (error) {
      if (error.name !== 'BucketAlreadyOwnedByYou') {
        throw error
      }
    }

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.from('test file content')
      })
    )
  })

  afterEach(() => {
    s3Client?.destroy()
  })

  testUploadsRepositoryContract(() => createUploadsRepository(s3Client))

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
