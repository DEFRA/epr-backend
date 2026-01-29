import { describe, beforeEach, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { buildPrn } from './test-data.js'

/**
 * Contract tests for PRN repository insert operations.
 * These tests verify that both MongoDB and in-memory implementations
 * behave consistently.
 *
 * @param {Function} it - Test function with fixtures
 */
export const testInsertBehaviour = (it) => {
  describe('insert operations', () => {
    let repository

    beforeEach(async ({ packagingRecyclingNotesRepository }) => {
      repository = packagingRecyclingNotesRepository
    })

    describe('basic behaviour', () => {
      it('inserts a PRN without error', async () => {
        const id = `contract-insert-${randomUUID()}`
        const prn = buildPrn({ _id: id })

        await repository.insert(id, prn)

        const found = await repository.findById(id)
        expect(found).toBeTruthy()
        expect(found.prnNumber).toBe('PRN-2026-00001')
      })

      it('stores the PRN so it can be retrieved', async () => {
        const id = `contract-retrievable-${randomUUID()}`
        const prn = buildPrn({
          _id: id,
          prnNumber: 'PRN-2026-00099',
          tonnageValue: 42
        })

        await repository.insert(id, prn)
        const found = await repository.findById(id)

        expect(found).toBeTruthy()
        expect(found.prnNumber).toBe('PRN-2026-00099')
        expect(found.tonnageValue).toBe(42)
      })

      it('throws conflict error when inserting duplicate ID', async () => {
        const id = `contract-duplicate-${randomUUID()}`
        const prn = buildPrn({ _id: id })

        await repository.insert(id, prn)

        await expect(repository.insert(id, prn)).rejects.toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })
      })
    })

    describe('concurrent insert race conditions', () => {
      it('rejects one of two concurrent inserts with same ID', async () => {
        const id = `contract-concurrent-${randomUUID()}`
        const prnA = buildPrn({ _id: id, prnNumber: 'PRN-A' })
        const prnB = buildPrn({ _id: id, prnNumber: 'PRN-B' })

        const results = await Promise.allSettled([
          repository.insert(id, prnA),
          repository.insert(id, prnB)
        ])

        const fulfilled = results.filter((r) => r.status === 'fulfilled')
        const rejected = results.filter((r) => r.status === 'rejected')

        expect(fulfilled).toHaveLength(1)
        expect(rejected).toHaveLength(1)
        expect(rejected[0].reason).toMatchObject({
          isBoom: true,
          output: { statusCode: 409 }
        })

        const found = await repository.findById(id)
        expect(found).toBeTruthy()
        expect(['PRN-A', 'PRN-B']).toContain(found.prnNumber)
      })
    })

    describe('validation', () => {
      it('rejects null id', async () => {
        await expect(repository.insert(null, buildPrn())).rejects.toThrow(/id/)
      })

      it('rejects undefined id', async () => {
        await expect(repository.insert(undefined, buildPrn())).rejects.toThrow(
          /id/
        )
      })

      it('rejects empty string id', async () => {
        await expect(repository.insert('', buildPrn())).rejects.toThrow(/id/)
      })
    })
  })
}
