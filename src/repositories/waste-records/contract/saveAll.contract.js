import { describe, beforeEach, expect } from 'vitest'
import { buildWasteRecord } from './test-data.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

export const testSaveAllBehaviour = (createTest) => {
  describe('saveAll', () => {
    let repository

    beforeEach(async ({ wasteRecordsRepository }) => {
      repository = await wasteRecordsRepository()
    })

    createTest('saves multiple waste records', async () => {
      const record1 = buildWasteRecord({ rowId: 'row-1' })
      const record2 = buildWasteRecord({ rowId: 'row-2' })

      await repository.saveAll([record1, record2])

      const result = await repository.findAll('org-1', 'reg-1')
      expect(result).toHaveLength(2)
    })

    createTest('auto-generates rowId when not provided', async () => {
      const record = buildWasteRecord()

      await repository.saveAll([record])

      const result = await repository.findAll('org-1', 'reg-1')
      expect(result).toHaveLength(1)
      expect(result[0].rowId).toMatch(/^row-\d+$/)
    })

    createTest('saves empty array without error', async () => {
      await expect(repository.saveAll([])).resolves.not.toThrow()
    })

    createTest('upserts waste records by org/reg/type/rowId', async () => {
      const initial = buildWasteRecord({
        organisationId: 'org-1',
        registrationId: 'reg-1',
        type: WASTE_RECORD_TYPE.RECEIVED,
        rowId: 'row-1',
        data: { ROW_ID: 'row-1', VALUE: 'initial' },
        versions: [
          {
            createdAt: '2025-01-15T10:00:00.000Z',
            status: 'created',
            summaryLog: { id: 'log-1', uri: 's3://bucket/key1' },
            data: { ROW_ID: 'row-1', VALUE: 'initial' }
          }
        ]
      })

      await repository.saveAll([initial])

      // Save updated version with same key
      const updated = buildWasteRecord({
        organisationId: 'org-1',
        registrationId: 'reg-1',
        type: WASTE_RECORD_TYPE.RECEIVED,
        rowId: 'row-1',
        data: { ROW_ID: 'row-1', VALUE: 'updated' },
        versions: [
          {
            createdAt: '2025-01-15T10:00:00.000Z',
            status: 'created',
            summaryLog: { id: 'log-1', uri: 's3://bucket/key1' },
            data: { ROW_ID: 'row-1', VALUE: 'initial' }
          },
          {
            createdAt: '2025-01-20T10:00:00.000Z',
            status: 'updated',
            summaryLog: { id: 'log-2', uri: 's3://bucket/key2' },
            data: { ROW_ID: 'row-1', VALUE: 'updated' }
          }
        ]
      })

      await repository.saveAll([updated])

      const result = await repository.findAll('org-1', 'reg-1')
      expect(result).toHaveLength(1)
      expect(result[0].data.VALUE).toBe('updated')
      expect(result[0].versions).toHaveLength(2)
    })

    createTest('treats different types as separate records', async () => {
      const receivedRecord = buildWasteRecord({
        rowId: 'row-1',
        type: WASTE_RECORD_TYPE.RECEIVED
      })
      const processedRecord = buildWasteRecord({
        rowId: 'row-1',
        type: WASTE_RECORD_TYPE.PROCESSED
      })

      await repository.saveAll([receivedRecord, processedRecord])

      const result = await repository.findAll('org-1', 'reg-1')
      expect(result).toHaveLength(2)
      expect(result.map((r) => r.type)).toEqual(
        expect.arrayContaining([
          WASTE_RECORD_TYPE.RECEIVED,
          WASTE_RECORD_TYPE.PROCESSED
        ])
      )
    })

    createTest('saves records with optional accreditationId', async () => {
      const recordWithAccreditation = buildWasteRecord({
        rowId: 'row-1',
        accreditationId: 'acc-1'
      })

      await repository.saveAll([recordWithAccreditation])

      const result = await repository.findAll('org-1', 'reg-1')
      expect(result).toHaveLength(1)
      expect(result[0].accreditationId).toBe('acc-1')
    })
  })
}
