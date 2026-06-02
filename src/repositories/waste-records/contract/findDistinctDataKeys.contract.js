import { describe, beforeEach, expect } from 'vitest'
import { buildVersionData, toWasteRecordVersions } from './test-data.js'

export const testFindDistinctDataKeysBehaviour = (it) => {
  describe('findDistinctDataKeys', () => {
    let repository

    beforeEach(
      async (
        /** @type {{ wasteRecordsRepository: import('../port.js').WasteRecordsRepositoryFactory }} */ {
          wasteRecordsRepository
        }
      ) => {
        repository = await wasteRecordsRepository()
      }
    )

    it('returns an empty array when no records exist', async () => {
      const result = await repository.findDistinctDataKeys()
      expect(result).toEqual([])
    })

    it('returns the union of data keys across every record in the collection', async () => {
      await repository.appendVersions(
        'org-1',
        'reg-1',
        toWasteRecordVersions({
          received: {
            'row-1': buildVersionData({
              versionData: { ALPHA: 1, BETA: 2 },
              currentData: { ALPHA: 1, BETA: 2 }
            })
          }
        })
      )
      await repository.appendVersions(
        'org-2',
        'reg-9',
        toWasteRecordVersions({
          received: {
            'row-2': buildVersionData({
              versionData: { BETA: 22, GAMMA: 'g' },
              currentData: { BETA: 22, GAMMA: 'g' }
            })
          }
        })
      )

      const result = await repository.findDistinctDataKeys()

      expect([...result].sort()).toEqual(['ALPHA', 'BETA', 'GAMMA'])
    })

    it('deduplicates keys that appear on multiple records', async () => {
      await repository.appendVersions(
        'org-1',
        'reg-1',
        toWasteRecordVersions({
          received: {
            'row-1': buildVersionData({
              versionData: { SHARED: 1 },
              currentData: { SHARED: 1 }
            }),
            'row-2': buildVersionData({
              versionData: { SHARED: 2 },
              currentData: { SHARED: 2 }
            })
          }
        })
      )

      const result = await repository.findDistinctDataKeys()

      expect(result).toEqual(['SHARED'])
    })
  })
}
