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
    let callbackReceiver

    beforeEach(
      async ({
        uploadsRepository: repo,
        performUpload: upload,
        callbackReceiver: receiver
      }) => {
        uploadsRepository = repo
        performUpload = upload
        callbackReceiver = receiver
      }
    )

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

    it('makes HTTP callback when upload completes', async () => {
      if (!callbackReceiver) {
        return
      }

      callbackReceiver.clear()

      const testFileBuffer = await fs.readFile(TEST_FILE_PATH)

      // Initiate upload
      const { uploadId } = await uploadsRepository.initiateSummaryLogUpload({
        organisationId: 'org-123',
        registrationId: 'reg-456',
        summaryLogId: 'sl-789'
      })

      // Perform upload
      await performUpload(uploadId, testFileBuffer)

      // Verify callback was made
      expect(callbackReceiver.requests).toHaveLength(1)
      expect(callbackReceiver.requests[0]).toMatchObject({
        path: '/v1/organisations/org-123/registrations/reg-456/summary-logs/sl-789/upload-completed',
        payload: {
          form: {
            summaryLogUpload: {
              fileId: uploadId,
              filename: `${uploadId}.xlsx`,
              fileStatus: 'complete',
              s3Bucket: expect.any(String),
              s3Key: expect.any(String)
            }
          }
        }
      })
    })
  })
}
