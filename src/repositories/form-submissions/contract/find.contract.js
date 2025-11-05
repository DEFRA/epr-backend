import { describe, expect } from 'vitest'

export const testFindBehaviour = (it) => {
  describe('find', () => {
    describe('findAllAccreditations', () => {
      it('returns empty array when no accreditations exist', async ({
        formSubmissionsRepository
      }) => {
        const repository = formSubmissionsRepository()

        const result = await repository.findAllAccreditations()

        expect(result).toEqual([])
      })

      it('returns all accreditations with field values', async ({
        seedAccreditations,
        formSubmissionsRepository
      }) => {
        const seededData = await seedAccreditations()
        const repository = formSubmissionsRepository()

        const result = await repository.findAllAccreditations()

        expect(result).toHaveLength(seededData.length)

        for (const acc of result) {
          const seeded = seededData.find((s) => s.id === acc.id)
          expect(acc.id).toBe(seeded.id)
          expect(acc.orgId).toBe(seeded.orgId)
          expect(acc.referenceNumber).toBe(seeded.referenceNumber)
          expect(acc.rawSubmissionData).toEqual(seeded.rawSubmissionData)
        }
      })
    })

    describe('findAllRegistrations', () => {
      it('returns empty array when no registrations exist', async ({
        formSubmissionsRepository
      }) => {
        const repository = formSubmissionsRepository()

        const result = await repository.findAllRegistrations()

        expect(result).toEqual([])
      })

      it('returns all registrations with field values', async ({
        seedRegistrations,
        formSubmissionsRepository
      }) => {
        const seededData = await seedRegistrations()
        const repository = formSubmissionsRepository()

        const result = await repository.findAllRegistrations()

        expect(result).toHaveLength(seededData.length)

        for (const reg of result) {
          const seeded = seededData.find((s) => s.id === reg.id)
          expect(reg.id).toBe(seeded.id)
          expect(reg.orgId).toBe(seeded.orgId)
          expect(reg.referenceNumber).toBe(seeded.referenceNumber)
          expect(reg.rawSubmissionData).toEqual(seeded.rawSubmissionData)
        }
      })
    })
  })
}
