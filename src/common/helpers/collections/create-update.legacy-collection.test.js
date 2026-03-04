import { describe, expect, it, vi } from 'vitest'
import { dropLegacyPackagingRecyclingNotesCollection } from './create-update'

describe('dropLegacyPackagingRecyclingNotesCollection', () => {
  it('drops l-packaging-recycling-notes when collection exists', async () => {
    const dropCollection = vi.fn()

    const db = {
      listCollections: vi.fn(() => ({
        toArray: vi
          .fn()
          .mockResolvedValue([{ name: 'l-packaging-recycling-notes' }])
      })),
      dropCollection
    }

    await dropLegacyPackagingRecyclingNotesCollection(db)

    expect(dropCollection).toHaveBeenCalledWith('l-packaging-recycling-notes')
  })

  it('does not drop collection when legacy collection does not exist', async () => {
    const dropCollection = vi.fn()

    const db = {
      listCollections: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([])
      })),
      dropCollection
    }

    await dropLegacyPackagingRecyclingNotesCollection(db)

    expect(dropCollection).not.toHaveBeenCalled()
  })

  it('ignores NamespaceNotFound errors from dropCollection', async () => {
    const dropCollection = vi.fn().mockRejectedValue({
      codeName: 'NamespaceNotFound'
    })

    const db = {
      listCollections: vi.fn(() => ({
        toArray: vi
          .fn()
          .mockResolvedValue([{ name: 'l-packaging-recycling-notes' }])
      })),
      dropCollection
    }

    await expect(
      dropLegacyPackagingRecyclingNotesCollection(db)
    ).resolves.toBeUndefined()
  })

  it('continues when non-NamespaceNotFound errors happen during dropCollection', async () => {
    const error = new Error('connection dropped')
    error.codeName = 'NetworkError'

    const db = {
      listCollections: vi.fn(() => ({
        toArray: vi
          .fn()
          .mockResolvedValue([{ name: 'l-packaging-recycling-notes' }])
      })),
      dropCollection: vi.fn().mockRejectedValue(error)
    }

    await expect(
      dropLegacyPackagingRecyclingNotesCollection(db)
    ).resolves.toBeUndefined()
  })
})
