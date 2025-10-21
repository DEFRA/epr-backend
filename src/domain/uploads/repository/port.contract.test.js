import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CreateBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3'

import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { createUploadsRepository } from '#adapters/repositories/uploads/s3.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { config } from '../../../config.js'

export const bucket = 'test-bucket'
export const key = 'path/to/summary-log.xlsx'

let s3Client

const implementations = [
  {
    name: 'inmemory',
    create: () => createInMemoryUploadsRepository(),
    destroy: () => {}
  },
  {
    name: 's3',
    create: async () => {
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

      return createUploadsRepository(s3Client)
    },
    destroy: () => s3Client?.destroy()
  }
]

describe('uploads contract tests', () => {
  describe.each(implementations)('$name', ({ name, create, destroy }) => {
    let uploadsRepository

    beforeEach(async () => {
      uploadsRepository = await create()
    })

    afterEach(async () => {
      await destroy()
    })

    it('should return expected result when file exists', async () => {
      const result = await uploadsRepository.findByLocation({
        bucket,
        key
      })

      expect(result).toBeInstanceOf(Buffer)
    })

    it('should return expected result when file does not exist', async () => {
      const result = await uploadsRepository.findByLocation({
        bucket: 'non-existent-bucket',
        key: 'non-existent-key'
      })

      expect(result).toBeNull()
    })
  })
})
