import { describe, beforeAll, afterAll, it as base, expect } from 'vitest'
import { startS3Server, stopS3Server } from '#vite/s3-memory-server.js'
import { CreateBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3'

import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { createUploadsRepository } from '#adapters/repositories/uploads/s3.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { config } from '../../../config.js'

export const bucket = 'test-bucket'
export const key = 'path/to/summary-log.xlsx'

let s3Client

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  s3UploadsRepository: async ({}, use) => {
    s3Client = createS3Client({
      region: config.get('awsRegion'),
      endpoint: config.get('s3Endpoint'),
      forcePathStyle: true
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

    const repository = createUploadsRepository(s3Client)
    await use(repository)
    s3Client?.destroy()
  },

  // eslint-disable-next-line no-empty-pattern
  inMemoryUploadsRepository: async ({}, use) => {
    const repository = createInMemoryUploadsRepository()
    await use(repository)
  }
})

describe('uploads contract tests', () => {
  beforeAll(async () => {
    await startS3Server()
  })

  afterAll(async () => {
    await stopS3Server()
  })

  describe('s3', () => {
    it('should return expected result when file exists', async ({
      s3UploadsRepository
    }) => {
      const result = await s3UploadsRepository.findByLocation({
        bucket,
        key
      })

      expect(result).toBeInstanceOf(Buffer)
    })

    it('should return expected result when file does not exist', async ({
      s3UploadsRepository
    }) => {
      const result = await s3UploadsRepository.findByLocation({
        bucket: 'non-existent-bucket',
        key: 'non-existent-key'
      })

      expect(result).toBeNull()
    })
  })

  describe('inmemory', () => {
    it('should return expected result when file exists', async ({
      inMemoryUploadsRepository
    }) => {
      const result = await inMemoryUploadsRepository.findByLocation({
        bucket,
        key
      })

      expect(result).toBeInstanceOf(Buffer)
    })

    it('should return expected result when file does not exist', async ({
      inMemoryUploadsRepository
    }) => {
      const result = await inMemoryUploadsRepository.findByLocation({
        bucket: 'non-existent-bucket',
        key: 'non-existent-key'
      })

      expect(result).toBeNull()
    })
  })
})
