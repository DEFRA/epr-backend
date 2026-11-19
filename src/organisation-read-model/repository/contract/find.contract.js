import {
  nextSeedAccreditationNumber,
  nextSeedRegistrationNumber,
  seedNamed
} from './organisation-seed-test-helpers.js'

/** @import { OrganisationReadRepositoryContractIt } from '../port.contract.js' */

const firstPage = { page: 1, pageSize: 10 }

/** @param {{ items: { name: string }[] }} page */
const namesOn = ({ items }) => items.map(({ name }) => name)

/**
 * @param {OrganisationReadRepositoryContractIt} it
 */
export const testFindBehaviour = (it) => {
  describe('find', () => {
    it('returns the organisations matching the search a page at a time, sorted by name', async ({
      organisationReadRepositoryServing
    }) => {
      const repository = await organisationReadRepositoryServing([
        seedNamed('Zeta Recycling'),
        seedNamed('Acme Recycling'),
        seedNamed('Beta Recycling'),
        seedNamed('Unrelated Ltd')
      ])

      const page = await repository.find({
        search: 'recycling',
        page: 1,
        pageSize: 2
      })

      expect(page).toMatchObject({
        page: 1,
        pageSize: 2,
        totalItems: 3,
        totalPages: 2
      })
      expect(namesOn(page)).toEqual(['Acme Recycling', 'Beta Recycling'])
    })

    it('treats an empty criterion as absent', async ({
      organisationReadRepositoryServing
    }) => {
      const repository = await organisationReadRepositoryServing([
        seedNamed('Beta Recycling'),
        seedNamed('Acme Recycling')
      ])

      const page = await repository.find({ search: '', ...firstPage })

      expect(namesOn(page)).toEqual(['Acme Recycling', 'Beta Recycling'])
    })

    it('finds an organisation by its organisation number', async ({
      organisationReadRepositoryServing
    }) => {
      const wanted = seedNamed('Beta Recycling')
      const repository = await organisationReadRepositoryServing([
        seedNamed('Acme Recycling'),
        wanted
      ])

      const page = await repository.find({
        organisationNumber: wanted.organisationNumber,
        ...firstPage
      })

      expect(namesOn(page)).toEqual(['Beta Recycling'])
    })

    it('finds an organisation by the whole of one of its registration numbers, ignoring case', async ({
      organisationReadRepositoryServing
    }) => {
      const registrationNumber = nextSeedRegistrationNumber()
      const repository = await organisationReadRepositoryServing([
        seedNamed('Acme Recycling'),
        seedNamed('Beta Recycling', {
          registrations: [{ registrationNumber }]
        })
      ])

      const whole = await repository.find({
        registrationNumber: registrationNumber.toLowerCase(),
        ...firstPage
      })
      const part = await repository.find({
        registrationNumber: registrationNumber.slice(0, -2),
        ...firstPage
      })

      expect(namesOn(whole)).toEqual(['Beta Recycling'])
      expect(part.items).toEqual([])
    })

    it('finds an organisation by the whole of one of its accreditation numbers, ignoring case', async ({
      organisationReadRepositoryServing
    }) => {
      const accreditationNumber = nextSeedAccreditationNumber()
      const repository = await organisationReadRepositoryServing([
        seedNamed('Acme Recycling'),
        seedNamed('Beta Recycling', {
          registrations: [
            {
              registrationNumber: nextSeedRegistrationNumber(),
              accreditationNumber
            }
          ]
        })
      ])

      const whole = await repository.find({
        accreditationNumber: accreditationNumber.toLowerCase(),
        ...firstPage
      })
      const part = await repository.find({
        accreditationNumber: accreditationNumber.slice(0, -2),
        ...firstPage
      })

      expect(namesOn(whole)).toEqual(['Beta Recycling'])
      expect(part.items).toEqual([])
    })

    it('finds only the organisations matching every criterion given', async ({
      organisationReadRepositoryServing
    }) => {
      const acme = seedNamed('Acme Recycling')
      const repository = await organisationReadRepositoryServing([
        acme,
        seedNamed('Beta Recycling')
      ])

      const page = await repository.find({
        search: 'beta',
        registrationNumber: acme.registrations[0].registrationNumber,
        ...firstPage
      })

      expect(page.items).toEqual([])
    })
  })
}
