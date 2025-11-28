import { describe } from 'vitest'
import { CreateBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { it } from '#vite/fixtures/cdp-uploader.js'
import {
  testUploadsRepositoryFileContract,
  testUploadsRepositoryInitiateContract,
  testUploadsRepositoryRoundTripContract
} from './port.contract.js'

const TEST_BUCKET = 'test-bucket'
const TEST_KEY = 'path/to/summary-log.xlsx'

// Extend fixture to seed test data for file contract tests
const fileContractIt = it.extend({
  // Seed the test bucket with test data before running file contract tests
  uploadsRepository: async ({ s3Client, uploadsRepository }, use) => {
    try {
      await s3Client.send(new CreateBucketCommand({ Bucket: TEST_BUCKET }))
    } catch (error) {
      if (error.name !== 'BucketAlreadyOwnedByYou') {
        throw error
      }
    }

    await s3Client.send(
      new PutObjectCommand({
        Bucket: TEST_BUCKET,
        Key: TEST_KEY,
        Body: Buffer.from('test file content')
      })
    )

    await use(uploadsRepository)
  }
})

describe('CDP Uploader uploads repository', () => {
  // File contract tests need seeded test data
  testUploadsRepositoryFileContract(fileContractIt)

  // Initiate and round-trip tests use the base fixture
  testUploadsRepositoryInitiateContract(it)
  testUploadsRepositoryRoundTripContract(it)
})
