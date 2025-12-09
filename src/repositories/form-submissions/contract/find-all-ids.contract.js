import { describe, expect } from 'vitest'

export const testFindAllFormSubmissionIdsBehaviour = (it) => {
  describe('findAllFormSubmissionIds', () => {
    it('returns all submission ids present in db', async ({
      seedAccreditations,
      seedRegistrations,
      seedOrganisations,
      formSubmissionsRepository
    }) => {
      const seededAccreditations = await seedAccreditations()
      const seededRegistrations = await seedRegistrations()
      const seededOrganisations = await seedOrganisations()
      const repository = formSubmissionsRepository()

      const result = await repository.findAllFormSubmissionIds()

      expect(result).toEqual({
        organisations: new Set(seededOrganisations.map((org) => org.id)),
        registrations: new Set(seededRegistrations.map((reg) => reg.id)),
        accreditations: new Set(seededAccreditations.map((acc) => acc.id))
      })
    })
  })
}
