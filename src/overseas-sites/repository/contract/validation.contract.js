import { describe, beforeEach, expect } from 'vitest'

export const testValidationBehaviour = (it) => {
  describe('validation', () => {
    let repository

    beforeEach(async ({ overseasSitesRepository }) => {
      repository = overseasSitesRepository
    })

    it('rejects creation with missing required fields', async () => {
      await expect(repository.create({})).rejects.toThrow(
        'Invalid overseas site data'
      )
    })

    it('rejects creation with missing address', async () => {
      await expect(
        repository.create({
          name: 'Test',
          country: 'India',
          createdAt: new Date(),
          updatedAt: new Date()
        })
      ).rejects.toThrow('Invalid overseas site data')
    })
  })
}
