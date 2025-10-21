import { describe, it, expect } from 'vitest'
import { createInMemoryOrganisationsRepository } from './inmemory.js'

describe('In-memory organisations repository', () => {
  it('findAll returns all organisations from in-memory storage', async () => {
    const initial = [
      { _id: 'org-1', name: 'Org One' },
      { _id: 'org-2', name: 'Org Two' }
    ]

    const repositoryFactory = createInMemoryOrganisationsRepository(initial)
    const repo = repositoryFactory()

    const result = await repo.findAll()
    expect(result).toEqual(initial)
  })

  it('findByOrgId returns matching organisation', async () => {
    const initial = [
      { _id: 'mongo-1', orgId: 500123, name: 'Acme' },
      { _id: 'mongo-2', orgId: 500124, name: 'Beta' }
    ]

    const repo = createInMemoryOrganisationsRepository(initial)()
    const result = await repo.findByOrgId(500123)
    expect(result).toEqual({ _id: 'mongo-1', orgId: 500123, name: 'Acme' })
  })

  it('findByOrgId returns null when no match', async () => {
    const initial = [{ _id: 'mongo-1', orgId: 500123, name: 'Acme' }]

    const repo = createInMemoryOrganisationsRepository(initial)()
    const result = await repo.findByOrgId(999999)
    expect(result).toBeNull()
  })

  describe('data isolation', () => {
    it('returns independent copies that cannot modify stored data', async () => {
      const initial = [
        { _id: 'org-1', name: 'Original' },
        { _id: 'org-2', name: 'Second' }
      ]

      const repositoryFactory = createInMemoryOrganisationsRepository(initial)
      const repo = repositoryFactory()

      const firstRead = await repo.findAll()
      // mutate returned array and objects
      firstRead[0].name = 'Mutated'
      firstRead.push({ _id: 'org-3', name: 'Injected' })

      const secondRead = await repo.findAll()
      expect(secondRead).toEqual([
        { _id: 'org-1', name: 'Original' },
        { _id: 'org-2', name: 'Second' }
      ])
    })

    it('stores independent copies so input mutations do not affect storage', async () => {
      const initial = [{ _id: 'org-1', name: 'Original' }]

      const repositoryFactory = createInMemoryOrganisationsRepository(initial)
      const repo = repositoryFactory()

      // mutate input after repo creation
      initial[0].name = 'Changed'
      initial.push({ _id: 'org-2', name: 'New' })

      const result = await repo.findAll()
      expect(result).toEqual([{ _id: 'org-1', name: 'Original' }])
    })

    it('findByOrgId returns a clone, not internal reference', async () => {
      const initial = [{ _id: 'mongo-1', orgId: 500123, name: 'Acme' }]
      const repo = createInMemoryOrganisationsRepository(initial)()

      const result = await repo.findByOrgId(500123)
      result.name = 'Changed'

      const again = await repo.findByOrgId(500123)
      expect(again).toEqual({ _id: 'mongo-1', orgId: 500123, name: 'Acme' })
    })
  })
})
