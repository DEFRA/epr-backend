import { describe, it, expect, vi } from 'vitest'
import { createOrganisationsRepository } from './mongodb.js'

describe('organisations mongodb repository', () => {
  it('findAll returns all organisations from the organisations collection', async () => {
    const toArray = vi
      .fn()
      .mockResolvedValue([{ _id: 'org-1', name: 'Org One' }])
    const find = vi.fn(() => ({ toArray }))
    const collection = vi.fn(() => ({ find }))
    const db = { collection }

    const repositoryFactory = createOrganisationsRepository(db)
    const repo = repositoryFactory()
    const result = await repo.findAll()

    expect(collection).toHaveBeenCalledWith('epr-organisations')
    expect(find).toHaveBeenCalled()
    expect(toArray).toHaveBeenCalled()
    expect(result).toEqual([{ _id: 'org-1', name: 'Org One' }])
  })
})
