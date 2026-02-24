import { describe, beforeEach, expect } from 'vitest'
import { buildVersionData, toWasteRecordVersions } from './test-data.js'

export const testFindByRegistrationBehaviour = (it) => {
  describe('findByRegistration', () => {
    let repository

    beforeEach(async ({ wasteRecordsRepository }) => {
      repository = await wasteRecordsRepository()
    })

    it('returns empty array when no waste records exist', async () => {
      const result = await repository.findByRegistration('org-1', 'reg-1')

      expect(result).toEqual([])
    })

    it(
      'returns all waste records for specific organisation and registration',
      async () => {
        const { version: version1, data: data1 } = buildVersionData()
        const { version: version2, data: data2 } = buildVersionData()

        const wasteRecordVersions = toWasteRecordVersions({
          received: {
            'row-1': { version: version1, data: data1 },
            'row-2': { version: version2, data: data2 }
          }
        })
        await repository.appendVersions('org-1', 'reg-1', wasteRecordVersions)

        const result = await repository.findByRegistration('org-1', 'reg-1')

        expect(result).toHaveLength(2)
        expect(result.map((r) => r.rowId)).toEqual(
          expect.arrayContaining(['row-1', 'row-2'])
        )
      }
    )

    it(
      'does not return waste records from different organisations',
      async () => {
        const { version: org1Version, data: org1Data } = buildVersionData()
        const { version: org2Version, data: org2Data } = buildVersionData()

        // Insert org1 record
        const org1VersionsByType = toWasteRecordVersions({
          received: {
            'row-1': { version: org1Version, data: org1Data }
          }
        })
        await repository.appendVersions('org-1', 'reg-1', org1VersionsByType)

        // Insert org2 record
        const org2VersionsByType = toWasteRecordVersions({
          received: {
            'row-2': { version: org2Version, data: org2Data }
          }
        })
        await repository.appendVersions('org-2', 'reg-1', org2VersionsByType)

        const result = await repository.findByRegistration('org-1', 'reg-1')

        expect(result).toHaveLength(1)
        expect(result[0].rowId).toBe('row-1')
        expect(result[0].organisationId).toBe('org-1')
      }
    )

    it(
      'does not return waste records from different registrations',
      async () => {
        const { version: reg1Version, data: reg1Data } = buildVersionData()
        const { version: reg2Version, data: reg2Data } = buildVersionData()

        // Insert reg1 record
        const reg1VersionsByType = toWasteRecordVersions({
          received: {
            'row-1': { version: reg1Version, data: reg1Data }
          }
        })
        await repository.appendVersions('org-1', 'reg-1', reg1VersionsByType)

        // Insert reg2 record
        const reg2VersionsByType = toWasteRecordVersions({
          received: {
            'row-2': { version: reg2Version, data: reg2Data }
          }
        })
        await repository.appendVersions('org-1', 'reg-2', reg2VersionsByType)

        const result = await repository.findByRegistration('org-1', 'reg-1')

        expect(result).toHaveLength(1)
        expect(result[0].rowId).toBe('row-1')
        expect(result[0].registrationId).toBe('reg-1')
      }
    )
  })
}
