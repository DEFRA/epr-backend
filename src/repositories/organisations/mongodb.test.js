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

  it('findByOrgId returns a single organisation by orgId', async () => {
    const org = { _id: 'mongo-id', orgId: 500123, name: 'Acme' }
    const findOne = vi.fn().mockResolvedValue(org)
    const collection = vi.fn(() => ({ findOne }))
    const db = { collection }

    const repo = createOrganisationsRepository(db)()
    const result = await repo.findByOrgId(500123)

    expect(collection).toHaveBeenCalledWith('epr-organisations')
    expect(findOne).toHaveBeenCalledWith({ orgId: 500123 })
    expect(result).toEqual(org)
  })

  it('findByOrgId returns null when organisation does not exist', async () => {
    const findOne = vi.fn().mockResolvedValue(null)
    const collection = vi.fn(() => ({ findOne }))
    const db = { collection }

    const repo = createOrganisationsRepository(db)()
    const result = await repo.findByOrgId(999999)

    expect(collection).toHaveBeenCalledWith('epr-organisations')
    expect(findOne).toHaveBeenCalledWith({ orgId: 999999 })
    expect(result).toBeNull()
  })
})
