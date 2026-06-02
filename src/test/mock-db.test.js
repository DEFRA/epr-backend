import { describe, expect, it, vi } from 'vitest'
import { createMockDb } from '#test/mock-db.js'

describe('createMockDb', () => {
  it('returns an object whose collection() yields a collection mock', () => {
    const db = createMockDb()
    const collection = db.collection('anything')

    expect(collection).toBeDefined()
  })

  it('returns the same collection mock for every collection name by default', () => {
    const db = createMockDb()

    expect(db.collection('a')).toBe(db.collection('b'))
  })

  it('applies collection-method stub overrides to the collection mock', async () => {
    const db = createMockDb({
      findOne: async () => ({ _id: 'found' })
    })
    const collection = db.collection('orgs')

    expect(await collection.findOne({})).toEqual({ _id: 'found' })
  })

  it('accepts a collection factory override receiving the collection name', () => {
    const collection = vi.fn()
    const db = createMockDb({ collection })

    db.collection('orgs')

    expect(collection).toHaveBeenCalledWith('orgs')
  })

  it('exposes default collection methods as vi mocks', () => {
    const db = createMockDb()
    const collection = db.collection('orgs')

    expect(vi.isMockFunction(collection.insertOne)).toBe(true)
  })
})
