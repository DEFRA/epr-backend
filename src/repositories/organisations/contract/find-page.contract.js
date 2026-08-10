import { beforeEach, describe, expect } from 'vitest'
import { buildOrganisation } from './test-data.js'

const buildOrgWithName = (name) => {
  const base = buildOrganisation()
  return {
    ...base,
    companyDetails: { ...base.companyDetails, name }
  }
}

const insertNamed = async (repository, names) => {
  for (const name of names) {
    await repository.insert(buildOrgWithName(name))
  }
}

/**
 * Builds an organisation carrying known search criteria: the first registration
 * gets the given registration number and the first accreditation the given
 * accreditation number. Everything else is left as buildOrganisation makes it,
 * so the registration/accreditation links stay intact.
 *
 * @param {{
 *   name?: string,
 *   orgId?: number,
 *   registrationNumber?: string,
 *   accreditationNumber?: string
 * }} [overrides]
 * @returns {Omit<import('#domain/organisations/model.js').Organisation, 'status'>}
 */
const buildOrgWithCriteria = ({
  name = 'Criteria Ltd',
  orgId,
  registrationNumber,
  accreditationNumber
} = {}) => {
  const base = buildOrganisation(orgId === undefined ? {} : { orgId })
  return {
    ...base,
    companyDetails: { ...base.companyDetails, name },
    registrations: base.registrations.map((registration, index) =>
      index === 0 && registrationNumber !== undefined
        ? { ...registration, registrationNumber }
        : registration
    ),
    accreditations: base.accreditations.map((accreditation, index) =>
      index === 0 && accreditationNumber !== undefined
        ? { ...accreditation, accreditationNumber }
        : accreditation
    )
  }
}

const namesOf = (result) => result.items.map((o) => o.companyDetails.name)

export const testFindPageBehaviour = (it) => {
  describe('findPage', () => {
    let repository

    beforeEach(
      async (
        /** @type {{ organisationsRepository: import("../port.js").OrganisationsRepositoryFactory }} */ {
          organisationsRepository
        }
      ) => {
        repository = await organisationsRepository()
      }
    )

    describe('empty collection', () => {
      it('returns items=[], totalItems=0, totalPages=0', async () => {
        const result = await repository.findPage({ page: 1, pageSize: 50 })

        expect(result).toEqual({
          items: [],
          page: 1,
          pageSize: 50,
          totalItems: 0,
          totalPages: 0
        })
      })
    })

    describe('pagination', () => {
      it('sorts results alphabetically by companyDetails.name ascending', async () => {
        await insertNamed(repository, ['Charlie Ltd', 'Alpha Co', 'Bravo Inc'])

        const result = await repository.findPage({ page: 1, pageSize: 10 })

        expect(result.items.map((o) => o.companyDetails.name)).toEqual([
          'Alpha Co',
          'Bravo Inc',
          'Charlie Ltd'
        ])
        expect(result.totalItems).toBe(3)
        expect(result.totalPages).toBe(1)
      })

      it('returns the requested page slice', async () => {
        await insertNamed(repository, ['A', 'B', 'C', 'D', 'E'])

        const result = await repository.findPage({ page: 2, pageSize: 2 })

        expect(result.items.map((o) => o.companyDetails.name)).toEqual([
          'C',
          'D'
        ])
        expect(result.page).toBe(2)
        expect(result.pageSize).toBe(2)
        expect(result.totalItems).toBe(5)
        expect(result.totalPages).toBe(3)
      })

      it('returns a partially filled last page', async () => {
        await insertNamed(repository, ['A', 'B', 'C', 'D', 'E'])

        const result = await repository.findPage({ page: 3, pageSize: 2 })

        expect(result.items.map((o) => o.companyDetails.name)).toEqual(['E'])
        expect(result.totalItems).toBe(5)
        expect(result.totalPages).toBe(3)
      })

      it('returns empty items when page is beyond end (no 404)', async () => {
        await insertNamed(repository, ['Only Org'])

        const result = await repository.findPage({ page: 99, pageSize: 10 })

        expect(result.items).toEqual([])
        expect(result.page).toBe(99)
        expect(result.pageSize).toBe(10)
        expect(result.totalItems).toBe(1)
        expect(result.totalPages).toBe(1)
      })

      it('computes totalPages correctly when totalItems is exactly divisible by pageSize', async () => {
        await insertNamed(repository, ['A', 'B', 'C', 'D'])

        const result = await repository.findPage({ page: 1, pageSize: 2 })

        expect(result.totalItems).toBe(4)
        expect(result.totalPages).toBe(2)
      })

      it('returns both organisations when two share the same name', async () => {
        await insertNamed(repository, ['Same Name Ltd', 'Same Name Ltd'])

        const result = await repository.findPage({ page: 1, pageSize: 10 })

        expect(result.totalItems).toBe(2)
        expect(result.items).toHaveLength(2)
        expect(
          result.items.every((o) => o.companyDetails.name === 'Same Name Ltd')
        ).toBe(true)
      })
    })

    describe('search', () => {
      it('filters case-insensitively by substring on companyDetails.name', async () => {
        await insertNamed(repository, ['Acme Ltd', 'ACME Corp', 'Globex Inc'])

        const result = await repository.findPage({
          search: 'acme',
          page: 1,
          pageSize: 50
        })

        expect(result.totalItems).toBe(2)
        expect(result.items.map((o) => o.companyDetails.name).sort()).toEqual([
          'ACME Corp',
          'Acme Ltd'
        ])
      })

      it('matches partial substrings (not just prefix)', async () => {
        await insertNamed(repository, ['Acme Holdings Ltd', 'Globex Inc'])

        const result = await repository.findPage({
          search: 'holdings',
          page: 1,
          pageSize: 50
        })

        expect(result.totalItems).toBe(1)
        expect(result.items[0].companyDetails.name).toBe('Acme Holdings Ltd')
      })

      it('returns empty items and zero totals when no matches', async () => {
        await insertNamed(repository, ['Acme Ltd'])

        const result = await repository.findPage({
          search: 'nonexistent',
          page: 1,
          pageSize: 50
        })

        expect(result.items).toEqual([])
        expect(result.totalItems).toBe(0)
        expect(result.totalPages).toBe(0)
      })

      it('treats empty string search as no filter', async () => {
        await insertNamed(repository, ['Acme Ltd', 'Globex Inc'])

        const result = await repository.findPage({
          search: '',
          page: 1,
          pageSize: 50
        })

        expect(result.totalItems).toBe(2)
      })

      it('treats undefined search as no filter', async () => {
        await insertNamed(repository, ['Acme Ltd', 'Globex Inc'])

        const result = await repository.findPage({
          page: 1,
          pageSize: 50
        })

        expect(result.totalItems).toBe(2)
      })

      it('escapes regex special characters in the search term', async () => {
        await insertNamed(repository, ['A.B.C Ltd', 'AXBXC Ltd'])

        const result = await repository.findPage({
          search: 'A.B.C',
          page: 1,
          pageSize: 50
        })

        expect(result.totalItems).toBe(1)
        expect(result.items[0].companyDetails.name).toBe('A.B.C Ltd')
      })

      it('counts only matching documents in totalItems when paginating a search', async () => {
        await insertNamed(repository, [
          'Acme A',
          'Acme B',
          'Acme C',
          'Acme D',
          'Acme E',
          'Globex A',
          'Globex B'
        ])

        const result = await repository.findPage({
          search: 'acme',
          page: 2,
          pageSize: 2
        })

        expect(result.items.map((o) => o.companyDetails.name)).toEqual([
          'Acme C',
          'Acme D'
        ])
        expect(result.totalItems).toBe(5)
        expect(result.totalPages).toBe(3)
      })
    })

    describe('criteria', () => {
      const HOLDER_ORG_ID = 700001
      const OTHER_ORG_ID = 700002

      let holder
      let other

      beforeEach(async () => {
        holder = buildOrgWithCriteria({
          name: 'Holder Ltd',
          orgId: HOLDER_ORG_ID,
          registrationNumber: 'REG001',
          accreditationNumber: 'ACC001'
        })
        other = buildOrgWithCriteria({
          name: 'Other Ltd',
          orgId: OTHER_ORG_ID,
          registrationNumber: 'REG002',
          accreditationNumber: 'ACC444'
        })
        await repository.insert(holder)
        await repository.insert(other)
      })

      it('finds the organisation holding the numeric orgId', async () => {
        const result = await repository.findPage({
          orgId: String(HOLDER_ORG_ID),
          page: 1,
          pageSize: 50
        })

        expect(namesOf(result)).toEqual(['Holder Ltd'])
        expect(result.totalItems).toBe(1)
      })

      it('finds the organisation whose document id is the orgId criterion', async () => {
        const result = await repository.findPage({
          orgId: holder.id,
          page: 1,
          pageSize: 50
        })

        expect(namesOf(result)).toEqual(['Holder Ltd'])
      })

      it('finds the organisation holding the registration id', async () => {
        const result = await repository.findPage({
          registrationId: holder.registrations[0].id,
          page: 1,
          pageSize: 50
        })

        expect(namesOf(result)).toEqual(['Holder Ltd'])
      })

      it('finds the organisation holding the registration number', async () => {
        const result = await repository.findPage({
          registrationNumber: 'REG001',
          page: 1,
          pageSize: 50
        })

        expect(namesOf(result)).toEqual(['Holder Ltd'])
      })

      it('finds the organisation holding the accreditation id', async () => {
        const result = await repository.findPage({
          accreditationId: holder.accreditations[0].id,
          page: 1,
          pageSize: 50
        })

        expect(namesOf(result)).toEqual(['Holder Ltd'])
      })

      it('finds the organisation holding the accreditation number', async () => {
        const result = await repository.findPage({
          accreditationNumber: 'ACC001',
          page: 1,
          pageSize: 50
        })

        expect(namesOf(result)).toEqual(['Holder Ltd'])
      })

      it('returns the organisation satisfying every criterion', async () => {
        const result = await repository.findPage({
          registrationNumber: 'REG001',
          accreditationNumber: 'ACC001',
          page: 1,
          pageSize: 50
        })

        expect(namesOf(result)).toEqual(['Holder Ltd'])
      })

      it('returns nothing when criteria are satisfied by different organisations', async () => {
        const result = await repository.findPage({
          registrationNumber: 'REG001',
          accreditationNumber: 'ACC444',
          page: 1,
          pageSize: 50
        })

        expect(result.items).toEqual([])
        expect(result.totalItems).toBe(0)
      })

      it('ANDs a criterion with the name search', async () => {
        const matching = await repository.findPage({
          search: 'holder',
          registrationNumber: 'REG001',
          page: 1,
          pageSize: 50
        })
        const mismatched = await repository.findPage({
          search: 'other',
          registrationNumber: 'REG001',
          page: 1,
          pageSize: 50
        })

        expect(namesOf(matching)).toEqual(['Holder Ltd'])
        expect(mismatched.items).toEqual([])
      })

      it('returns no results for an orgId that is neither a number nor a document id', async () => {
        const result = await repository.findPage({
          orgId: 'not-an-id',
          page: 1,
          pageSize: 50
        })

        expect(result.items).toEqual([])
        expect(result.totalItems).toBe(0)
      })

      it('matches numbers case-insensitively', async () => {
        const result = await repository.findPage({
          registrationNumber: 'reg001',
          accreditationNumber: 'acc001',
          page: 1,
          pageSize: 50
        })

        expect(namesOf(result)).toEqual(['Holder Ltd'])
      })

      it('does not match a number by prefix', async () => {
        const result = await repository.findPage({
          registrationNumber: 'REG00',
          page: 1,
          pageSize: 50
        })

        expect(result.items).toEqual([])
      })

      it('escapes regex special characters in a number criterion', async () => {
        await repository.insert(
          buildOrgWithCriteria({
            name: 'Dotted Ltd',
            registrationNumber: 'REG.01'
          })
        )
        await repository.insert(
          buildOrgWithCriteria({
            name: 'Undotted Ltd',
            registrationNumber: 'REGX01'
          })
        )

        const result = await repository.findPage({
          registrationNumber: 'REG.01',
          page: 1,
          pageSize: 50
        })

        expect(namesOf(result)).toEqual(['Dotted Ltd'])
      })

      it('treats empty-string criteria as absent', async () => {
        const result = await repository.findPage({
          search: '',
          orgId: '',
          registrationId: '',
          registrationNumber: '',
          accreditationId: '',
          accreditationNumber: '',
          page: 1,
          pageSize: 50
        })

        expect(result.totalItems).toBe(2)
      })

      it('treats undefined criteria as absent', async () => {
        const result = await repository.findPage({
          orgId: undefined,
          registrationId: undefined,
          registrationNumber: undefined,
          accreditationId: undefined,
          accreditationNumber: undefined,
          page: 1,
          pageSize: 50
        })

        expect(result.totalItems).toBe(2)
      })

      it('counts and pages only the organisations matching a criterion', async () => {
        for (const name of ['Shared A', 'Shared B', 'Shared C']) {
          await repository.insert(
            buildOrgWithCriteria({ name, accreditationNumber: 'ACC777' })
          )
        }

        const result = await repository.findPage({
          accreditationNumber: 'ACC777',
          page: 2,
          pageSize: 2
        })

        expect(namesOf(result)).toEqual(['Shared C'])
        expect(result.totalItems).toBe(3)
        expect(result.totalPages).toBe(2)
      })
    })

    describe('returned organisation shape', () => {
      it('returns the full Organisation shape with computed status field', async () => {
        const org = buildOrgWithName('Acme Ltd')
        await repository.insert(org)

        const result = await repository.findPage({ page: 1, pageSize: 10 })

        const found = result.items[0]
        expect(found.id).toBe(org.id)
        expect(found.orgId).toBe(org.orgId)
        expect(found.companyDetails.name).toBe('Acme Ltd')
        expect(found.status).toBeDefined()
      })
    })
  })
}
