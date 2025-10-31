export const testFindByLocationBehaviour = (repositoryFactory) => {
  describe('findByLocation', () => {
    let uploadsRepository

    beforeEach(async () => {
      uploadsRepository = await repositoryFactory()
    })

    it('should return expected result when file exists', async () => {
      const result = await uploadsRepository.findByLocation({
        bucket: 'test-bucket',
        key: 'path/to/summary-log.xlsx'
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
}
