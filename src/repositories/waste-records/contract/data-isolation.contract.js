import { describe, beforeEach, expect } from 'vitest'
import {
  buildWasteRecord,
  buildVersionData,
  toWasteRecordVersions
} from './test-data.js'

export const testDataIsolationBehaviour = (createTest) => {
  describe('data isolation', () => {
    let repository

    beforeEach(async ({ wasteRecordsRepository }) => {
      repository = await wasteRecordsRepository()
    })

    describe('findByRegistration isolation', () => {
      createTest(
        'returns independent copies that cannot modify stored data',
        async () => {
          const { version: version1, data: data1 } = buildVersionData()
          const { version: version2, data: data2 } = buildVersionData()

          const wasteRecordVersions = toWasteRecordVersions({
            received: {
              'row-1': { version: version1, data: data1 },
              'row-2': { version: version2, data: data2 }
            }
          })

          await repository.appendVersions(
            'org-1',
            'reg-1',
            undefined,
            wasteRecordVersions
          )

          const firstRead = await repository.findByRegistration(
            'org-1',
            'reg-1'
          )
          const originalRowId = firstRead[0].rowId

          // mutate returned array and objects
          firstRead[0].rowId = 'mutated-id'
          firstRead.push(buildWasteRecord({ rowId: 'row-3' }))

          const secondRead = await repository.findByRegistration(
            'org-1',
            'reg-1'
          )
          expect(secondRead).toHaveLength(2)
          expect(secondRead[0].rowId).toBe(originalRowId)
        }
      )
    })

    describe('appendVersions isolation', () => {
      createTest(
        'stores independent copies so input mutations do not affect storage',
        async () => {
          const { version, data } = buildVersionData()

          const wasteRecordVersions = toWasteRecordVersions({
            received: {
              'row-1': { version, data }
            }
          })

          await repository.appendVersions(
            'org-1',
            'reg-1',
            undefined,
            wasteRecordVersions
          )

          // mutate input after save
          data.GROSS_WEIGHT = 999.99
          wasteRecordVersions.get('received').get('row-1').data.GROSS_WEIGHT =
            999.99

          const result = await repository.findByRegistration('org-1', 'reg-1')
          expect(result[0].data.GROSS_WEIGHT).toBe(100.5)
        }
      )
    })
  })
}
