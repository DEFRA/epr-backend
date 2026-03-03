import { beforeEach, describe, expect } from 'vitest'

/**
 * @typedef {Object} ContractTestFixtures
 * @property {Object} formsFileUploadsRepository - The adapter under test
 */

/**
 * Contract test for the Forms File Uploads Repository.
 *
 * @param {import('vitest').TestAPI<ContractTestFixtures>} it - Vitest test function extended with required fixtures
 */
export const testFormsFileUploadsRepositoryContract = (it) => {
  describe('forms file uploads repository contract', () => {
    let formsFileUploadsRepository

    beforeEach(({ formsFileUploadsRepository: repo }) => {
      formsFileUploadsRepository = repo
    })

    it('copies file to S3 and retrieves it', async () => {
      const fileId = 'test-file-123'
      const regulator = 'EA'

      await formsFileUploadsRepository.copyFormFileToS3({
        fileId,
        regulator
      })

      const stream = await formsFileUploadsRepository.getFileById(fileId)
      expect(stream).toBeDefined()
      const chunks = []
      for await (const chunk of stream) {
        chunks.push(chunk)
      }
      const content = Buffer.concat(chunks)

      expect(content.length).toBeGreaterThan(0)
    })

    it('throws error when getting non-existent file', async () => {
      await expect(
        formsFileUploadsRepository.getFileById('non-existent-file')
      ).rejects.toThrow('File not found: non-existent-file')
    })
  })
}
