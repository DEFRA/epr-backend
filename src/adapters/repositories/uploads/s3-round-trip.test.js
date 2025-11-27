import { describe } from 'vitest'
import { it } from '#vite/fixtures/cdp-uploader.js'
import {
  testUploadsRepositoryInitiateContract,
  testUploadsRepositoryRoundTripContract
} from './port.contract.js'

describe('S3 uploads repository with CDP Uploader', () => {
  testUploadsRepositoryInitiateContract(it)
  testUploadsRepositoryRoundTripContract(it)
})
