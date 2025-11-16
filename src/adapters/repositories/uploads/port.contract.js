import { describe, beforeEach } from 'vitest'

export const testUploadsRepositoryContract = (it) => {
  describe('uploads repository contract', () => {
    describe('findByLocation', () => {
      let uploadsRepository

      beforeEach(async ({ uploadsRepository: repo }) => {
        uploadsRepository = repo
      })

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
