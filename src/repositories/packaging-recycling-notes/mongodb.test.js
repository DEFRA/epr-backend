import { describe, expect } from 'vitest'
import { createPackagingRecyclingNotesRepository } from './mongodb'

describe('MongoDB packaging recycling notes repository', () => {
  it('creates the repository', async () => {
    const hexId = '123456789012345678901234'
    const prn = { _id: hexId }

    const dbMock = {
      collection: function () {
        return this
      },
      findOne: function () {
        return prn
      }
    }
    const repository = createPackagingRecyclingNotesRepository(dbMock)()

    expect(repository).toEqual({
      findById: expect.any(Function)
    })

    expect(await repository.findById(hexId)).toEqual(prn)
  })
})
