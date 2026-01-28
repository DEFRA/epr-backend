import { describe, beforeEach, expect } from 'vitest'

/**
 * Contract tests for PRN repository find operations.
 * These tests verify that both MongoDB and in-memory implementations
 * behave consistently.
 *
 * @param {Function} it - Test function with fixtures
 */
export const testFindBehaviour = (it) => {
  describe('find operations', () => {
    let repository

    beforeEach(async ({ packagingRecyclingNotesRepository }) => {
      repository = packagingRecyclingNotesRepository
    })

    describe('findById', () => {
      it('returns null when ID not found', async () => {
        // Use valid 24-char hex string that doesn't exist
        const result = await repository.findById('000000000000000000000000')

        expect(result).toBeNull()
      })
    })

    describe('findByAccreditationId', () => {
      it('returns empty array when no PRNs found', async () => {
        const result = await repository.findByAccreditationId('nonexistent-acc')

        expect(result).toEqual([])
      })
    })

    describe('findById validation', () => {
      it('rejects null id', async () => {
        await expect(repository.findById(null)).rejects.toThrow(/id/)
      })

      it('rejects undefined id', async () => {
        await expect(repository.findById(undefined)).rejects.toThrow(/id/)
      })

      it('rejects empty string id', async () => {
        await expect(repository.findById('')).rejects.toThrow(/id/)
      })
    })

    describe('findByAccreditationId validation', () => {
      it('rejects null accreditationId', async () => {
        await expect(repository.findByAccreditationId(null)).rejects.toThrow(
          /id/
        )
      })

      it('rejects undefined accreditationId', async () => {
        await expect(
          repository.findByAccreditationId(undefined)
        ).rejects.toThrow(/id/)
      })

      it('rejects empty string accreditationId', async () => {
        await expect(repository.findByAccreditationId('')).rejects.toThrow(/id/)
      })
    })
  })
}
