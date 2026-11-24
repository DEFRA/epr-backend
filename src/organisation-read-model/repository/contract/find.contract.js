import { toRegistrationNumber } from '#domain/organisations/numbers.js'
import {
  nextSeedAccreditationNumber,
  nextSeedRegistrationNumber,
  seedNamed
} from './organisation-seed-test-helpers.js'

/** @import { OrganisationReadRepositoryContractIt, OrganisationReadRepositoryServing } from '../port.contract.js' */

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

    it('finds nothing for a value that is not an organisation number', async ({
      organisationReadRepositoryServing
    }) => {
      const repository = await organisationReadRepositoryServing([
        seedNamed('Acme Recycling')
      ])

      const page = await repository.find({
        organisationNumber: 'not-a-number',
        ...firstPage
      })

      expect(page.items).toEqual([])
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

    it('finds the organisation whose registration and accreditation numbers both match', async ({
      organisationReadRepositoryServing
    }) => {
      const registrationNumber = nextSeedRegistrationNumber()
      const accreditationNumber = nextSeedAccreditationNumber()
      const repository = await organisationReadRepositoryServing([
        seedNamed('Acme Recycling'),
        seedNamed('Beta Recycling', {
          registrations: [{ registrationNumber, accreditationNumber }]
        })
      ])

      const page = await repository.find({
        registrationNumber,
        accreditationNumber,
        ...firstPage
      })

      expect(namesOn(page)).toEqual(['Beta Recycling'])
    })

    it('finds nothing when different organisations satisfy the criteria', async ({
      organisationReadRepositoryServing
    }) => {
      const acme = seedNamed('Acme Recycling')
      const accreditationNumber = nextSeedAccreditationNumber()
      const repository = await organisationReadRepositoryServing([
        acme,
        seedNamed('Beta Recycling', {
          registrations: [
            {
              registrationNumber: nextSeedRegistrationNumber(),
              accreditationNumber
            }
          ]
        })
      ])

      const page = await repository.find({
        registrationNumber: acme.registrations[0].registrationNumber,
        accreditationNumber,
        ...firstPage
      })

      expect(page).toMatchObject({ items: [], totalItems: 0, totalPages: 0 })
    })

    it('treats undefined criteria as absent', async ({
      organisationReadRepositoryServing
    }) => {
      const repository = await organisationReadRepositoryServing([
        seedNamed('Beta Recycling'),
        seedNamed('Acme Recycling')
      ])

      const page = await repository.find({
        search: undefined,
        organisationNumber: undefined,
        registrationNumber: undefined,
        accreditationNumber: undefined,
        ...firstPage
      })

      expect(namesOn(page)).toEqual(['Acme Recycling', 'Beta Recycling'])
    })

    it('treats every criterion given as an empty string as absent', async ({
      organisationReadRepositoryServing
    }) => {
      const repository = await organisationReadRepositoryServing([
        seedNamed('Beta Recycling'),
        seedNamed('Acme Recycling')
      ])

      const page = await repository.find({
        search: '',
        organisationNumber: '',
        registrationNumber: '',
        accreditationNumber: '',
        ...firstPage
      })

      expect(namesOn(page)).toEqual(['Acme Recycling', 'Beta Recycling'])
    })

    it('matches a number criterion literally, not as a pattern', async ({
      organisationReadRepositoryServing
    }) => {
      const base = nextSeedRegistrationNumber()
      const dotted = toRegistrationNumber(`${base}.1`)
      const repository = await organisationReadRepositoryServing([
        seedNamed('Dotted Recycling', {
          registrations: [{ registrationNumber: dotted }]
        }),
        seedNamed('Undotted Recycling', {
          registrations: [
            { registrationNumber: toRegistrationNumber(`${base}X1`) }
          ]
        })
      ])

      const page = await repository.find({
        registrationNumber: dotted,
        ...firstPage
      })

      expect(namesOn(page)).toEqual(['Dotted Recycling'])
    })

    describe('search', () => {
      it('matches anywhere in the name, ignoring case', async ({
        organisationReadRepositoryServing
      }) => {
        const repository = await organisationReadRepositoryServing([
          seedNamed('Acme Holdings Ltd'),
          seedNamed('ACME Corp'),
          seedNamed('Globex Inc')
        ])

        const anywhere = await repository.find({
          search: 'holdings',
          ...firstPage
        })
        const anyCase = await repository.find({ search: 'acme', ...firstPage })

        expect(namesOn(anywhere)).toEqual(['Acme Holdings Ltd'])
        expect(namesOn(anyCase)).toEqual(['ACME Corp', 'Acme Holdings Ltd'])
      })

      it('finds nothing, with zero totals, when no name matches', async ({
        organisationReadRepositoryServing
      }) => {
        const repository = await organisationReadRepositoryServing([
          seedNamed('Acme Recycling')
        ])

        const page = await repository.find({
          search: 'nonexistent',
          ...firstPage
        })

        expect(page).toMatchObject({ items: [], totalItems: 0, totalPages: 0 })
      })

      it('matches the search term literally, not as a pattern', async ({
        organisationReadRepositoryServing
      }) => {
        const repository = await organisationReadRepositoryServing([
          seedNamed('A.B.C Ltd'),
          seedNamed('AXBXC Ltd')
        ])

        const page = await repository.find({ search: 'A.B.C', ...firstPage })

        expect(namesOn(page)).toEqual(['A.B.C Ltd'])
      })

      it('counts and pages only the organisations whose names match', async ({
        organisationReadRepositoryServing
      }) => {
        const repository = await organisationReadRepositoryServing(
          [
            'Acme A',
            'Acme B',
            'Acme C',
            'Acme D',
            'Acme E',
            'Globex A',
            'Globex B'
          ].map((name) => seedNamed(name))
        )

        const page = await repository.find({
          search: 'acme',
          page: 2,
          pageSize: 2
        })

        expect(namesOn(page)).toEqual(['Acme C', 'Acme D'])
        expect(page).toMatchObject({ totalItems: 5, totalPages: 3 })
      })
    })

    describe('pagination', () => {
      /**
       * @param {OrganisationReadRepositoryServing} serving
       * @param {string[]} names
       */
      const servingNamed = (serving, names) =>
        serving(names.map((name) => seedNamed(name)))

      it('gives an empty page, with zero totals, when there are no organisations', async ({
        organisationReadRepositoryServing
      }) => {
        const repository = await organisationReadRepositoryServing([])

        const page = await repository.find({ page: 1, pageSize: 50 })

        expect(page).toEqual({
          items: [],
          page: 1,
          pageSize: 50,
          totalItems: 0,
          totalPages: 0
        })
      })

      it('gives the requested page of organisations sorted by name', async ({
        organisationReadRepositoryServing
      }) => {
        const repository = await servingNamed(
          organisationReadRepositoryServing,
          ['E', 'C', 'A', 'D', 'B']
        )

        const page = await repository.find({ page: 2, pageSize: 2 })

        expect(namesOn(page)).toEqual(['C', 'D'])
        expect(page).toMatchObject({
          page: 2,
          pageSize: 2,
          totalItems: 5,
          totalPages: 3
        })
      })

      it('gives a partly filled last page', async ({
        organisationReadRepositoryServing
      }) => {
        const repository = await servingNamed(
          organisationReadRepositoryServing,
          ['A', 'B', 'C', 'D', 'E']
        )

        const page = await repository.find({ page: 3, pageSize: 2 })

        expect(namesOn(page)).toEqual(['E'])
        expect(page).toMatchObject({ totalItems: 5, totalPages: 3 })
      })

      it('gives an empty page past the last one', async ({
        organisationReadRepositoryServing
      }) => {
        const repository = await servingNamed(
          organisationReadRepositoryServing,
          ['Only Recycling']
        )

        const page = await repository.find({ page: 99, pageSize: 10 })

        expect(page).toEqual({
          items: [],
          page: 99,
          pageSize: 10,
          totalItems: 1,
          totalPages: 1
        })
      })

      it('counts whole pages when the organisations fill them exactly', async ({
        organisationReadRepositoryServing
      }) => {
        const repository = await servingNamed(
          organisationReadRepositoryServing,
          ['A', 'B', 'C', 'D']
        )

        const page = await repository.find({ page: 1, pageSize: 2 })

        expect(page).toMatchObject({ totalItems: 4, totalPages: 2 })
      })

      it('gives every organisation when two share a name', async ({
        organisationReadRepositoryServing
      }) => {
        const repository = await servingNamed(
          organisationReadRepositoryServing,
          ['Same Name Ltd', 'Same Name Ltd']
        )

        const page = await repository.find(firstPage)

        expect(namesOn(page)).toEqual(['Same Name Ltd', 'Same Name Ltd'])
        expect(page.totalItems).toBe(2)
      })
    })
  })
}
