import { describe, expect } from 'vitest'
import { ObjectId } from 'mongodb'

export const testFindCreatedAfterBehaviour = (it) => {
  describe('find', () => {
    describe('findCreatedAfter', () => {
      const cutoffDate = new Date('2026-01-01T00:00:00Z')
      const beforeDate = new Date('2025-12-31T23:59:59Z')
      const afterDate = new Date('2026-01-02T00:00:00Z')

      describe('findRegistrationsCreatedAfter', () => {
        it('returns only registrations created after the supplied date', async ({
          seedRegistrations,
          formSubmissionsRepository
        }) => {
          const oldRef = new ObjectId().toString()
          const newRef = new ObjectId().toString()

          await seedRegistrations([
            { referenceNumber: oldRef, createdAt: beforeDate },
            { referenceNumber: newRef, createdAt: afterDate }
          ])

          const repository = formSubmissionsRepository()
          const result =
            await repository.findRegistrationsCreatedAfter(cutoffDate)

          expect(result).toHaveLength(1)
          expect(result[0].referenceNumber).toBe(newRef)
          expect(result[0].id).toBeDefined()
        })

        it('returns empty array when all registrations are older than supplied date', async ({
          seedRegistrations,
          formSubmissionsRepository
        }) => {
          const oldRef = new ObjectId().toString()

          await seedRegistrations([
            { referenceNumber: oldRef, createdAt: beforeDate }
          ])

          const repository = formSubmissionsRepository()
          const result =
            await repository.findRegistrationsCreatedAfter(cutoffDate)

          expect(result).toEqual([])
        })
      })

      describe('findAccreditationsCreatedAfter', () => {
        it('returns only accreditations created after the supplied date', async ({
          seedAccreditations,
          formSubmissionsRepository
        }) => {
          const oldRef = new ObjectId().toString()
          const newRef = new ObjectId().toString()

          await seedAccreditations([
            { referenceNumber: oldRef, createdAt: beforeDate },
            { referenceNumber: newRef, createdAt: afterDate }
          ])

          const repository = formSubmissionsRepository()
          const result =
            await repository.findAccreditationsCreatedAfter(cutoffDate)

          expect(result).toHaveLength(1)
          expect(result[0].referenceNumber).toBe(newRef)
        })

        it('returns empty array when no accreditations match the date criteria', async ({
          formSubmissionsRepository
        }) => {
          const repository = formSubmissionsRepository()
          const result =
            await repository.findAccreditationsCreatedAfter(cutoffDate)

          expect(result).toEqual([])
        })
      })
    })
  })
}
