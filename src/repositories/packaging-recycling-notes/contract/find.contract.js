import { describe, beforeEach, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { buildPrn } from './test-data.js'

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
      it('returns PRN when found by ID', async () => {
        const id = `contract-find-${randomUUID()}`
        const prn = buildPrn({ _id: id })
        await repository.insert(id, prn)

        const result = await repository.findById(id)

        expect(result).toBeTruthy()
        expect(result.prnNumber).toBe('PRN-2026-00001')
        expect(result.tonnageValue).toBe(9)
        expect(result.issuedToOrganisation.name).toBe('ComplyPak Ltd')
      })

      it('returns null when ID not found', async () => {
        const id = `contract-nonexistent-${randomUUID()}`
        const result = await repository.findById(id)

        expect(result).toBeNull()
      })

      it('does not return PRNs with different IDs', async () => {
        const idA = `contract-prn-a-${randomUUID()}`
        const idB = `contract-prn-b-${randomUUID()}`

        await repository.insert(idA, buildPrn({ _id: idA, prnNumber: 'PRN-A' }))
        await repository.insert(idB, buildPrn({ _id: idB, prnNumber: 'PRN-B' }))

        const result = await repository.findById(idA)

        expect(result.prnNumber).toBe('PRN-A')
      })
    })

    describe('findByAccreditationId', () => {
      it('returns PRNs matching the accreditation', async () => {
        const accreditationId = `contract-acc-${randomUUID()}`
        const prn1 = buildPrn({
          _id: `contract-prn-1-${randomUUID()}`,
          accreditationId,
          prnNumber: 'PRN-001'
        })
        const prn2 = buildPrn({
          _id: `contract-prn-2-${randomUUID()}`,
          accreditationId,
          prnNumber: 'PRN-002'
        })
        const prnOtherAcc = buildPrn({
          _id: `contract-prn-3-${randomUUID()}`,
          accreditationId: `contract-other-acc-${randomUUID()}`,
          prnNumber: 'PRN-003'
        })

        await repository.insert(prn1._id, prn1)
        await repository.insert(prn2._id, prn2)
        await repository.insert(prnOtherAcc._id, prnOtherAcc)

        const result = await repository.findByAccreditationId(accreditationId)

        expect(result).toHaveLength(2)
        expect(result.map((p) => p.prnNumber)).toEqual(
          expect.arrayContaining(['PRN-001', 'PRN-002'])
        )
      })

      it('returns empty array when no PRNs found', async () => {
        const id = `contract-empty-acc-${randomUUID()}`
        const result = await repository.findByAccreditationId(id)

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

      it('rejects number id', async () => {
        await expect(repository.findById(123)).rejects.toThrow(/id/)
      })

      it('rejects object id', async () => {
        await expect(repository.findById({})).rejects.toThrow(/id/)
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
