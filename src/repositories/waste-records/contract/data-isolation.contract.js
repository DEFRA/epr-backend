import { describe, beforeEach, expect } from 'vitest'
import { buildWasteRecord } from './test-data.js'

export const testDataIsolationBehaviour = (createTest) => {
  describe('data isolation', () => {
    let repository

    beforeEach(async ({ wasteRecordsRepository }) => {
      repository = await wasteRecordsRepository()
    })

    describe('findAll isolation', () => {
      createTest(
        'returns independent copies that cannot modify stored data',
        async () => {
          const record1 = buildWasteRecord({ rowId: 'row-1' })
          const record2 = buildWasteRecord({ rowId: 'row-2' })
          await repository.saveAll([record1, record2])

          const firstRead = await repository.findAll('org-1', 'reg-1')
          const originalRowId = firstRead[0].rowId

          // mutate returned array and objects
          firstRead[0].rowId = 'mutated-id'
          firstRead.push(buildWasteRecord({ rowId: 'row-3' }))

          const secondRead = await repository.findAll('org-1', 'reg-1')
          expect(secondRead).toHaveLength(2)
          expect(secondRead[0].rowId).toBe(originalRowId)
        }
      )
    })

    describe('saveAll isolation', () => {
      createTest(
        'stores independent copies so input mutations do not affect storage',
        async () => {
          const record = buildWasteRecord({ rowId: 'row-1' })
          const originalRowId = record.rowId

          await repository.saveAll([record])

          // mutate input after save
          record.rowId = 'mutated-id'

          const result = await repository.findAll('org-1', 'reg-1')
          expect(result[0].rowId).toBe(originalRowId)
        }
      )
    })
  })
}
