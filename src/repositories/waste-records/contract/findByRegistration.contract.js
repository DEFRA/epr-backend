import { describe, beforeEach, expect } from 'vitest'
import { buildWasteRecord } from './test-data.js'

export const testFindByRegistrationBehaviour = (createTest) => {
  describe('findByRegistration', () => {
    let repository

    beforeEach(async ({ wasteRecordsRepository }) => {
      repository = await wasteRecordsRepository()
    })

    createTest('returns empty array when no waste records exist', async () => {
      const result = await repository.findByRegistration('org-1', 'reg-1')

      expect(result).toEqual([])
    })

    createTest(
      'returns all waste records for specific organisation and registration',
      async () => {
        const record1 = buildWasteRecord({
          organisationId: 'org-1',
          registrationId: 'reg-1',
          rowId: 'row-1'
        })
        const record2 = buildWasteRecord({
          organisationId: 'org-1',
          registrationId: 'reg-1',
          rowId: 'row-2'
        })

        await repository.upsertWasteRecords([record1, record2])

        const result = await repository.findByRegistration('org-1', 'reg-1')

        expect(result).toHaveLength(2)
        expect(result.map((r) => r.rowId)).toEqual(
          expect.arrayContaining(['row-1', 'row-2'])
        )
      }
    )

    createTest(
      'does not return waste records from different organisations',
      async () => {
        const org1Record = buildWasteRecord({
          organisationId: 'org-1',
          registrationId: 'reg-1',
          rowId: 'row-1'
        })
        const org2Record = buildWasteRecord({
          organisationId: 'org-2',
          registrationId: 'reg-1',
          rowId: 'row-2'
        })

        await repository.upsertWasteRecords([org1Record, org2Record])

        const result = await repository.findByRegistration('org-1', 'reg-1')

        expect(result).toHaveLength(1)
        expect(result[0].rowId).toBe('row-1')
        expect(result[0].organisationId).toBe('org-1')
      }
    )

    createTest(
      'does not return waste records from different registrations',
      async () => {
        const reg1Record = buildWasteRecord({
          organisationId: 'org-1',
          registrationId: 'reg-1',
          rowId: 'row-1'
        })
        const reg2Record = buildWasteRecord({
          organisationId: 'org-1',
          registrationId: 'reg-2',
          rowId: 'row-2'
        })

        await repository.upsertWasteRecords([reg1Record, reg2Record])

        const result = await repository.findByRegistration('org-1', 'reg-1')

        expect(result).toHaveLength(1)
        expect(result[0].rowId).toBe('row-1')
        expect(result[0].registrationId).toBe('reg-1')
      }
    )
  })
}
