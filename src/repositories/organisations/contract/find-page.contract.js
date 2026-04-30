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

export const testFindPageBehaviour = (it) => {
  describe('findPage', () => {
    let repository

    beforeEach(async ({ organisationsRepository }) => {
      repository = await organisationsRepository()
    })

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
