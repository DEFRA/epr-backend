import { describe, beforeEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const TEST_FILE_PATH = path.resolve(
  __dirname,
  '../../../data/fixtures/uploads/reprocessor.xlsx'
)

/**
 * Contract test for the uploads repository.
 *
 * Tests the full round-trip: initiate upload → file uploaded → retrieve file.
 *
 * The fixture must provide:
 * - uploadsRepository: the adapter under test
 * - performUpload: function(uploadId, buffer) that simulates/performs the upload
 *   and returns { s3Uri } where the file can be retrieved
 */
export const testUploadsRepositoryContract = (it) => {
  describe('uploads repository contract', () => {
    let uploadsRepository
    let performUpload

    beforeEach(async ({ uploadsRepository: repo, performUpload: upload }) => {
      uploadsRepository = repo
      performUpload = upload
    })

    it('initiates upload and returns upload details', async () => {
      const result = await uploadsRepository.initiateSummaryLogUpload({
        organisationId: 'org-123',
        registrationId: 'reg-456',
        summaryLogId: 'sl-789'
      })

      expect(result).toMatchObject({
        uploadId: expect.any(String),
        uploadUrl: expect.any(String),
        statusUrl: expect.any(String)
      })
      expect(result.uploadUrl).toContain(result.uploadId)
      expect(result.statusUrl).toContain(result.uploadId)
    })

    it('completes full upload flow: initiate, upload file, retrieve', async () => {
      const testFileBuffer = await fs.readFile(TEST_FILE_PATH)

      // 1. Initiate upload
      const { uploadId } = await uploadsRepository.initiateSummaryLogUpload({
        organisationId: 'org-123',
        registrationId: 'reg-456',
        summaryLogId: 'sl-789'
      })

      expect(uploadId).toBeDefined()

      // 2. Perform upload (infrastructure-specific)
      const { s3Uri } = await performUpload(uploadId, testFileBuffer)

      expect(s3Uri).toBeDefined()

      // 3. Retrieve file
      const retrievedFile = await uploadsRepository.findByLocation(s3Uri)

      expect(retrievedFile).toBeInstanceOf(Buffer)
      expect(retrievedFile.length).toBe(testFileBuffer.length)
    })

    it('returns null when file does not exist', async () => {
      const result = await uploadsRepository.findByLocation(
        's3://non-existent-bucket/non-existent-key'
      )

      expect(result).toBeNull()
    })
  })
}
