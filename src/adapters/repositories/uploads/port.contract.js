import { describe, beforeEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { waitForCallback } from './test-helpers/callback-receiver.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const TEST_FILE_PATH = path.resolve(
  __dirname,
  '../../../data/fixtures/uploads/reprocessor.xlsx'
)

/**
 * @typedef {Object} ContractTestFixtures
 * @property {import('#domain/uploads/repository/port.js').UploadsRepository} uploadsRepository - The adapter under test
 * @property {(uploadId: string, buffer: Buffer) => Promise<void>} performUpload - Uploads the file to the upload service
 * @property {import('./test-helpers/callback-receiver.js').CallbackReceiver} callbackReceiver - Captures HTTP callbacks
 */

/**
 * Contract test for the uploads repository.
 * Tests the full round-trip: initiate upload → callback received → retrieve file.
 *
 * @param {import('vitest').TestAPI<ContractTestFixtures>} it - Vitest test function extended with required fixtures
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

    it('completes full upload flow: initiate, upload file, callback, retrieve', async () => {
      const testFileBuffer = await fs.readFile(TEST_FILE_PATH)

      callbackReceiver.clear()

      // 1. Initiate upload
      const { uploadId } = await uploadsRepository.initiateSummaryLogUpload({
        organisationId: 'org-123',
        registrationId: 'reg-456',
        summaryLogId: 'sl-789'
      })

      expect(uploadId).toBeDefined()

      // 2. Perform upload (infrastructure-specific)
      await performUpload(uploadId, testFileBuffer)

      // 3. Wait for callback
      const callback = await waitForCallback(callbackReceiver)

      // 4. Extract S3 URI from callback
      const { s3Bucket, s3Key } = callback.payload.form.file
      const s3Uri = `s3://${s3Bucket}/${s3Key}`

      // 5. Retrieve file
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

      // Wait for callback
      const callback = await waitForCallback(callbackReceiver)

      // Verify callback contents
      expect(callback).toMatchObject({
        path: '/v1/organisations/org-123/registrations/reg-456/summary-logs/sl-789/upload-completed',
        payload: {
          form: {
            file: {
              fileId: expect.any(String),
              filename: 'summary-log.xlsx',
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
