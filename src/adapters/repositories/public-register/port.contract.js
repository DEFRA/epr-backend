import { beforeEach, describe } from 'vitest'

/**
 * @typedef {Object} ContractTestFixtures
 * @property {import('#domain/public-register/repository/port.js').PublicRegisterRepository} publicRegisterRepository - The adapter under test
 */

/**
 * Contract test for the public register repository.
 *
 * @param {import('vitest').TestAPI<ContractTestFixtures>} it - Vitest test function extended with required fixtures
 */
export const testPublicRegisterRepositoryContract = (it) => {
  describe('public register repository contract', () => {
    let publicRegisterRepository

    beforeEach(({ publicRegisterRepository: repo }) => {
      publicRegisterRepository = repo
    })

    it('saves CSV data and retrieves it', async () => {
      const fileName = 'test-file.csv'
      const csvData = 'header1,header2\nvalue1,value2'

      // Save the file
      await publicRegisterRepository.save(fileName, csvData)

      // Generate presigned URL
      const result =
        await publicRegisterRepository.generatePresignedUrl(fileName)
      expect(result).toBeDefined()
      expect(result.url).toBeDefined()
      expect(typeof result.url).toBe('string')
      expect(result.expiresAt).toBeDefined()
      expect(typeof result.expiresAt).toBe('string')
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now())

      // Fetch and validate data
      const retrievedData =
        await publicRegisterRepository.fetchFromPresignedUrl(result.url)
      expect(retrievedData).toBe(csvData)
    })

    it('generates presigned URL for saved file', async () => {
      const fileName = 'presigned-test.csv'
      const csvData = 'Name,Age\nAlice,30'

      await publicRegisterRepository.save(fileName, csvData)
      const result =
        await publicRegisterRepository.generatePresignedUrl(fileName)

      expect(result).toBeDefined()
      expect(result.url).toBeDefined()
      expect(typeof result.url).toBe('string')
      expect(result.url).toContain(fileName)
      expect(result.expiresAt).toBeDefined()
      expect(typeof result.expiresAt).toBe('string')
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now())
    })
  })
}
