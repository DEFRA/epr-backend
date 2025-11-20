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

    describe('findAllOrganisations', () => {
      it('returns empty array when no organisations exist', async ({
        formSubmissionsRepository
      }) => {
        const repository = formSubmissionsRepository()

        const result = await repository.findAllOrganisations()

        expect(result).toEqual([])
      })

      it('returns all organisations with field values', async ({
        seedOrganisations,
        formSubmissionsRepository
      }) => {
        const seededData = await seedOrganisations()
        const repository = formSubmissionsRepository()

        const result = await repository.findAllOrganisations()

        expect(result).toHaveLength(seededData.length)

        for (const org of result) {
          const seeded = seededData.find((s) => s.id === org.id)
          expect(org.id).toBe(seeded.id)
          expect(org.orgId).toBe(seeded.orgId)
          expect(org.rawSubmissionData).toEqual(seeded.rawSubmissionData)
        }
      })
    })

    describe('findOrganisationById', () => {
      it('returns null when no organisation exists with supplied ID', async ({
        formSubmissionsRepository
      }) => {
        const repository = formSubmissionsRepository()

        const documentId = '000011112222333344445555' // a valid ID that does not match a document in the seeded data

        const result = await repository.findOrganisationById(documentId)

        expect(result).toBeNull()
      })

      it.for([null, undefined, '', '   '])(
        'returns null when supplied ID is empty - %s',
        async (input, { formSubmissionsRepository }) => {
          const repository = formSubmissionsRepository()

          const result = await repository.findOrganisationById(input)

          expect(result).toBeNull()
        }
      )

      it('returns organisation with field values', async ({
        seedOrganisations,
        formSubmissionsRepository
      }) => {
        const seededData = await seedOrganisations()
        const repository = formSubmissionsRepository()

        expect(seededData.length).toBeGreaterThanOrEqual(1)

        for (const seeded of seededData) {
          const result = await repository.findOrganisationById(seeded.id)
          expect(result.id).toBe(seeded.id)
          expect(result.orgId).toBe(seeded.orgId)
          expect(result.rawSubmissionData).toEqual(seeded.rawSubmissionData)
        }
      })
    })
  })
}
