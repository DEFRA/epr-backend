import { describe, beforeEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Contract tests for file storage operations (findByLocation).
 * Use this for adapters with real storage backends (e.g. S3).
 */
export const testUploadsRepositoryFileContract = (it) => {
  describe('uploads repository file contract', () => {
    let uploadsRepository

    beforeEach(async ({ uploadsRepository: repo }) => {
      uploadsRepository = repo
    })

    describe('findByLocation', () => {
      it('should return expected result when file exists', async () => {
        const result = await uploadsRepository.findByLocation(
          's3://test-bucket/path/to/summary-log.xlsx'
        )

        expect(result).toBeInstanceOf(Buffer)
      })

      it('should return expected result when file does not exist', async () => {
        const result = await uploadsRepository.findByLocation(
          's3://non-existent-bucket/non-existent-key'
        )

        expect(result).toBeNull()
      })
    })
  })
}

/**
 * Contract tests for summary log upload initiation.
 * Use this for adapters where initiate can be tested without external HTTP calls.
 */
export const testUploadsRepositoryInitiateContract = (it) => {
  describe('uploads repository initiate contract', () => {
    let uploadsRepository

    beforeEach(async ({ uploadsRepository: repo }) => {
      uploadsRepository = repo
    })

    describe('initiateSummaryLogUpload', () => {
      it('returns upload details on successful initiation', async () => {
        const options = {
          organisationId: 'org-123',
          registrationId: 'reg-456',
          summaryLogId: 'sl-789'
        }

        const result = await uploadsRepository.initiateSummaryLogUpload(options)

        expect(result).toMatchObject({
          uploadId: expect.any(String),
          uploadUrl: expect.any(String),
          statusUrl: expect.any(String)
        })
      })

      it('includes uploadId in uploadUrl', async () => {
        const options = {
          organisationId: 'org-123',
          registrationId: 'reg-456',
          summaryLogId: 'sl-001'
        }

        const result = await uploadsRepository.initiateSummaryLogUpload(options)

        expect(result.uploadUrl).toContain(result.uploadId)
      })

      it('includes uploadId in statusUrl', async () => {
        const options = {
          organisationId: 'org-123',
          registrationId: 'reg-456',
          summaryLogId: 'sl-002'
        }

        const result = await uploadsRepository.initiateSummaryLogUpload(options)

        expect(result.statusUrl).toContain(result.uploadId)
      })
    })
  })
}

/**
 * Full contract tests - use for in-memory adapter.
 */
export const testUploadsRepositoryContract = (it) => {
  testUploadsRepositoryFileContract(it)
  testUploadsRepositoryInitiateContract(it)
}

const TEST_FILE_PATH = path.resolve(
  __dirname,
  '../../../data/fixtures/uploads/reprocessor.xlsx'
)

const POLL_INTERVAL_MS = 500
const MAX_POLL_ATTEMPTS = 30

async function waitForUploadComplete(cdpUploaderUrl, uploadId) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const response = await fetch(`${cdpUploaderUrl}/status/${uploadId}`)
    const status = await response.json()

    expect(status.uploadStatus).not.toBe('rejected')

    if (status.uploadStatus === 'ready') {
      return status
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error(
    `Upload did not complete within ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS}ms`
  )
}

/**
 * Contract tests for full round-trip upload flow.
 * Requires CDP Uploader stack (LocalStack + Redis + CDP Uploader).
 * Tests: initiate → upload file → virus scan → retrieve from S3.
 */
export const testUploadsRepositoryRoundTripContract = (it) => {
  describe('uploads repository round-trip contract', () => {
    let uploadsRepository
    let cdpUploaderStack

    beforeEach(async ({ uploadsRepository: repo, cdpUploaderStack: stack }) => {
      uploadsRepository = repo
      cdpUploaderStack = stack
    })

    it('completes full upload flow: initiate, upload file, retrieve', async () => {
      const organisationId = 'org-123'
      const registrationId = 'reg-456'
      const summaryLogId = 'sl-789'

      // 1. Initiate upload via CDP Uploader
      const { uploadId, uploadUrl } =
        await uploadsRepository.initiateSummaryLogUpload({
          organisationId,
          registrationId,
          summaryLogId
        })

      expect(uploadId).toBeDefined()
      expect(uploadUrl).toBeDefined()

      // 2. Upload test Excel file to CDP Uploader
      // uploadUrl is a full URL from CDP Uploader (e.g. http://localhost:7337/upload-and-scan/xxx)
      // We need to extract just the path and use the socat proxy URL instead
      const uploadUrlPath = new URL(uploadUrl).pathname
      const testFileBuffer = await fs.readFile(TEST_FILE_PATH)
      const formData = new FormData()
      formData.append(
        'file',
        new Blob([testFileBuffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }),
        'summary-log.xlsx'
      )

      const uploadResponse = await fetch(
        `${cdpUploaderStack.cdpUploader.url}${uploadUrlPath}`,
        {
          method: 'POST',
          body: formData,
          // CDP Uploader redirects to frontend after upload - don't follow it in tests
          redirect: 'manual'
        }
      )

      // CDP Uploader returns 302 redirect on successful upload
      expect(uploadResponse.status).toBe(302)

      // 3. Wait for virus scan to complete
      const status = await waitForUploadComplete(
        cdpUploaderStack.cdpUploader.url,
        uploadId
      )

      expect(status.uploadStatus).toBe('ready')
      expect(status.form?.file?.s3Key).toBeDefined()

      // 4. Retrieve file from S3 via findByLocation
      const s3Uri = `s3://re-ex-summary-logs/${status.form.file.s3Key}`
      const retrievedFile = await uploadsRepository.findByLocation(s3Uri)

      expect(retrievedFile).toBeInstanceOf(Buffer)
      expect(retrievedFile.length).toBe(testFileBuffer.length)
    })
  })
}
