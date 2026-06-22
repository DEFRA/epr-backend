import { describe, it, expect } from 'vitest'

import { createReadOnlyDb } from './read-only-db.js'

/** @import { Db } from 'mongodb' */

const fakeCollection = () => ({
  find: () => 'find-result',
  findOne: () => 'find-one-result',
  createIndex: () => {
    throw new Error('index write reached the driver')
  },
  insertOne: () => {
    throw new Error('data write reached the driver')
  }
})

// A minimal stand-in for the mongodb `Db` — only `collection` is exercised.
// Casting a hand-rolled double to the full driver interface is the one place a
// cast is warranted: faking every member of `Db` would test nothing.
const fakeDb = (collection) =>
  /** @type {Db} */ (/** @type {unknown} */ ({ collection: () => collection }))

describe('createReadOnlyDb', () => {
  it('passes read methods through to the underlying collection', () => {
    const db = createReadOnlyDb(fakeDb(fakeCollection()))

    expect(db.collection('any').find()).toBe('find-result')
    expect(db.collection('any').findOne()).toBe('find-one-result')
  })

  it('neutralises index creation so connecting issues no writes', async () => {
    const db = createReadOnlyDb(fakeDb(fakeCollection()))

    await expect(
      db.collection('any').createIndex({ summaryLogIds: 1 })
    ).resolves.toBeUndefined()
  })

  it('refuses data writes loudly', () => {
    const db = createReadOnlyDb(fakeDb(fakeCollection()))

    expect(() => db.collection('any').insertOne({})).toThrow(
      'read-only: insertOne is not permitted'
    )
  })

  it('returns a read-only collection from createCollection without writing', async () => {
    const db = createReadOnlyDb(fakeDb(fakeCollection()))

    const collection = await db.createCollection('any')

    expect(collection.find()).toBe('find-result')
    await expect(
      collection.createIndex({ summaryLogIds: 1 })
    ).resolves.toBeUndefined()
  })
})
