import { describe, expect, it } from 'vitest'
import { createPackagingRecyclingNotesRepository } from './mongodb'

describe('MongoDB packaging recycling notes repository', () => {
  it('creates the repository', async () => {
    const hexId = '123456789012345678901234'
    const prn = { _id: hexId }

    const dbMock = {
      collection: function () {
        return this
      },
      createIndex: async () => {},
      findOne: function () {
        return prn
      }
    }
    const factory = await createPackagingRecyclingNotesRepository(dbMock)
    const repository = factory()

    expect(repository).toEqual({
      findById: expect.any(Function)
    })

    expect(await repository.findById(hexId)).toEqual(prn)
  })
})
