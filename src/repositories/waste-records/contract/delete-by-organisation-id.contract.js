import { describe, beforeEach, expect } from 'vitest'
import { buildVersionData, toWasteRecordVersions } from './test-data.js'

export const testDeleteByOrganisationIdBehaviour = (it) => {
  describe('deleteByOrganisationId', () => {
    let repository

    beforeEach(async ({ wasteRecordsRepository }) => {
      repository = await wasteRecordsRepository()
    })

    it('returns 0 when storage is empty', async () => {
      const result = await repository.deleteByOrganisationId('org-1')

      expect(result).toBe(0)
    })

    it('returns 0 when no records match the organisationId', async () => {
      const { version, data } = buildVersionData()
      const wasteRecordVersions = toWasteRecordVersions({
        received: {
          'row-1': { version, data }
        }
      })
      await repository.appendVersions('org-1', 'reg-1', wasteRecordVersions)

      const result = await repository.deleteByOrganisationId('org-2')

      expect(result).toBe(0)
      const remaining = await repository.findByRegistration('org-1', 'reg-1')
      expect(remaining).toHaveLength(1)
    })

    it('deletes all waste records for the given organisationId across multiple registrations', async () => {
      const { version: v1, data: d1 } = buildVersionData({
        summaryLogId: 'summary-log-1'
      })
      const { version: v2, data: d2 } = buildVersionData({
        summaryLogId: 'summary-log-2'
      })
      const { version: v3, data: d3 } = buildVersionData({
        summaryLogId: 'summary-log-3'
      })

      await repository.appendVersions(
        'org-1',
        'reg-1',
        toWasteRecordVersions({
          received: {
            'row-1': { version: v1, data: d1 },
            'row-2': { version: v2, data: d2 }
          }
        })
      )
      await repository.appendVersions(
        'org-1',
        'reg-2',
        toWasteRecordVersions({
          received: {
            'row-3': { version: v3, data: d3 }
          }
        })
      )

      const result = await repository.deleteByOrganisationId('org-1')

      expect(result).toBe(3)
      expect(await repository.findByRegistration('org-1', 'reg-1')).toEqual([])
      expect(await repository.findByRegistration('org-1', 'reg-2')).toEqual([])
    })

    it('does not delete records belonging to other organisations', async () => {
      const { version: v1, data: d1 } = buildVersionData({
        summaryLogId: 'summary-log-1'
      })
      const { version: v2, data: d2 } = buildVersionData({
        summaryLogId: 'summary-log-2'
      })

      await repository.appendVersions(
        'org-1',
        'reg-1',
        toWasteRecordVersions({
          received: {
            'row-1': { version: v1, data: d1 }
          }
        })
      )
      await repository.appendVersions(
        'org-2',
        'reg-1',
        toWasteRecordVersions({
          received: {
            'row-2': { version: v2, data: d2 }
          }
        })
      )

      const result = await repository.deleteByOrganisationId('org-1')

      expect(result).toBe(1)
      expect(await repository.findByRegistration('org-1', 'reg-1')).toEqual([])
      const org2Records = await repository.findByRegistration('org-2', 'reg-1')
      expect(org2Records).toHaveLength(1)
      expect(org2Records[0].rowId).toBe('row-2')
    })
  })
}
