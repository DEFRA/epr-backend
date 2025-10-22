import { describe, it, expect } from 'vitest'
import { createInMemoryOrganisationsRepository } from './inmemory.js'
import { ObjectId } from 'mongodb'

describe('In-memory organisations repository', () => {
  it('findAll returns all organisations from in-memory storage', async () => {
    const initial = [
      { id: 'org-1', name: 'Org One' },
      { id: 'org-2', name: 'Org Two' }
    ]

    const repositoryFactory = createInMemoryOrganisationsRepository(initial)
    const repo = repositoryFactory()

    const result = await repo.findAll()
    expect(result).toEqual(initial)
  })

  it('findById returns matching organisation', async () => {
    const initial = [
      { id: new ObjectId().toString(), name: 'Acme' },
      { id: new ObjectId().toString(), name: 'Beta' }
    ]

    const repo = createInMemoryOrganisationsRepository(initial)()
    const result = await repo.findById(initial[0].id.toString())
    expect(result).toEqual(initial[0])
  })

  it('findById returns null when no match', async () => {
    const initial = [{ id: new ObjectId().toString(), name: 'Acme' }]

    const repo = createInMemoryOrganisationsRepository(initial)()
    const result = await repo.findById(new ObjectId().toString())
    expect(result).toBeNull()
  })

  describe('data isolation', () => {
    it('returns independent copies that cannot modify stored data', async () => {
      const initial = [
        { id: new ObjectId().toString(), name: 'Original' },
        { id: new ObjectId().toString(), name: 'Second' }
      ]

      const repositoryFactory = createInMemoryOrganisationsRepository(initial)
      const repo = repositoryFactory()

      const firstRead = await repo.findAll()
      // mutate returned array and objects
      firstRead[0].name = 'Mutated'
      firstRead.push({ id: new ObjectId().toString(), name: 'Injected' })

      const secondRead = await repo.findAll()
      expect(secondRead).toEqual(initial)
    })

    it('stores independent copies so input mutations do not affect storage', async () => {
      const initial = [{ id: new ObjectId().toString(), name: 'Original' }]

      const repositoryFactory = createInMemoryOrganisationsRepository(initial)
      const repo = repositoryFactory()

      // mutate input after repo creation
      initial[0].name = 'Changed'
      initial.push({ id: new ObjectId().toString(), name: 'New' })

      const result = await repo.findAll()
      expect(result).toEqual([{ id: initial[0].id, name: 'Original' }])
    })

    it('findById returns a clone, not internal reference', async () => {
      const initial = [{ id: new ObjectId().toString(), name: 'Acme' }]
      const repo = createInMemoryOrganisationsRepository(initial)()

      const result = await repo.findById(initial[0].id)
      result.name = 'Changed'

      const again = await repo.findById(initial[0].id)
      expect(again).toEqual(initial[0])
    })
  })
})
