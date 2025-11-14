import { describe, beforeEach, expect } from 'vitest'
import {
  WASTE_RECORD_TYPE,
  VERSION_STATUS
} from '#domain/waste-records/model.js'

export const testAppendVersionsBehaviour = (createTest) => {
  describe('appendVersions', () => {
    let repository

    beforeEach(async ({ wasteRecordsRepository }) => {
      repository = await wasteRecordsRepository()
    })

    createTest('creates new waste record with first version', async () => {
      const versionsByKey = new Map([
        [
          'received:row-1',
          {
            data: { ROW_ID: 'row-1', VALUE: 'initial' },
            version: {
              createdAt: '2025-01-15T10:00:00.000Z',
              status: VERSION_STATUS.CREATED,
              summaryLog: { id: 'log-1', uri: 's3://bucket/key1' }
            }
          }
        ]
      ])

      await repository.appendVersions('org-1', 'reg-1', versionsByKey)

      const result = await repository.findByRegistration('org-1', 'reg-1')
      expect(result).toHaveLength(1)
      expect(result[0].rowId).toBe('row-1')
      expect(result[0].type).toBe(WASTE_RECORD_TYPE.RECEIVED)
      expect(result[0].data.VALUE).toBe('initial')
      expect(result[0].versions).toHaveLength(1)
      expect(result[0].versions[0].summaryLog.id).toBe('log-1')
    })

    createTest('appends version to existing waste record', async () => {
      // First, create initial record using appendVersions
      const initialVersion = new Map([
        [
          'received:row-1',
          {
            data: { ROW_ID: 'row-1', VALUE: 'initial' },
            version: {
              createdAt: '2025-01-15T10:00:00.000Z',
              status: VERSION_STATUS.CREATED,
              summaryLog: { id: 'log-1', uri: 's3://bucket/key1' }
            }
          }
        ]
      ])

      await repository.appendVersions('org-1', 'reg-1', initialVersion)

      // Now append a new version
      const updatedVersion = new Map([
        [
          'received:row-1',
          {
            data: { ROW_ID: 'row-1', VALUE: 'updated' },
            version: {
              createdAt: '2025-01-20T10:00:00.000Z',
              status: VERSION_STATUS.UPDATED,
              summaryLog: { id: 'log-2', uri: 's3://bucket/key2' }
            }
          }
        ]
      ])

      await repository.appendVersions('org-1', 'reg-1', updatedVersion)

      const result = await repository.findByRegistration('org-1', 'reg-1')
      expect(result).toHaveLength(1)
      expect(result[0].data.VALUE).toBe('updated')
      expect(result[0].versions).toHaveLength(2)
      expect(result[0].versions[0].summaryLog.id).toBe('log-1')
      expect(result[0].versions[1].summaryLog.id).toBe('log-2')
    })

    createTest(
      'is idempotent - resubmitting same summary log does not duplicate versions',
      async () => {
        // First submission
        const versionsByKey = new Map([
          [
            'received:row-1',
            {
              data: { ROW_ID: 'row-1', VALUE: 'initial' },
              version: {
                createdAt: '2025-01-15T10:00:00.000Z',
                status: VERSION_STATUS.CREATED,
                summaryLog: { id: 'log-1', uri: 's3://bucket/key1' }
              }
            }
          ]
        ])

        await repository.appendVersions('org-1', 'reg-1', versionsByKey)

        // Retry same submission (e.g., after failure recovery)
        await repository.appendVersions('org-1', 'reg-1', versionsByKey)

        const result = await repository.findByRegistration('org-1', 'reg-1')
        expect(result).toHaveLength(1)
        expect(result[0].versions).toHaveLength(1) // Only one version, not duplicated
        expect(result[0].versions[0].summaryLog.id).toBe('log-1')
      }
    )

    createTest('handles multiple records in bulk operation', async () => {
      const versionsByKey = new Map([
        [
          'received:row-1',
          {
            data: { ROW_ID: 'row-1', VALUE: 'first' },
            version: {
              createdAt: '2025-01-15T10:00:00.000Z',
              status: VERSION_STATUS.CREATED,
              summaryLog: { id: 'log-1', uri: 's3://bucket/key1' }
            }
          }
        ],
        [
          'received:row-2',
          {
            data: { ROW_ID: 'row-2', VALUE: 'second' },
            version: {
              createdAt: '2025-01-15T10:00:00.000Z',
              status: VERSION_STATUS.CREATED,
              summaryLog: { id: 'log-1', uri: 's3://bucket/key1' }
            }
          }
        ],
        [
          'processed:row-1',
          {
            data: { ROW_ID: 'row-1', VALUE: 'third' },
            version: {
              createdAt: '2025-01-15T10:00:00.000Z',
              status: VERSION_STATUS.CREATED,
              summaryLog: { id: 'log-1', uri: 's3://bucket/key1' }
            }
          }
        ]
      ])

      await repository.appendVersions('org-1', 'reg-1', versionsByKey)

      const result = await repository.findByRegistration('org-1', 'reg-1')
      expect(result).toHaveLength(3)
    })

    createTest('handles empty versionsByKey map without error', async () => {
      const versionsByKey = new Map()

      await expect(
        repository.appendVersions('org-1', 'reg-1', versionsByKey)
      ).resolves.not.toThrow()
    })

    createTest('isolates different record types with same rowId', async () => {
      const versionsByKey = new Map([
        [
          'received:row-1',
          {
            data: { ROW_ID: 'row-1', VALUE: 'received-data' },
            version: {
              createdAt: '2025-01-15T10:00:00.000Z',
              status: VERSION_STATUS.CREATED,
              summaryLog: { id: 'log-1', uri: 's3://bucket/key1' }
            }
          }
        ],
        [
          'processed:row-1',
          {
            data: { ROW_ID: 'row-1', VALUE: 'processed-data' },
            version: {
              createdAt: '2025-01-15T10:00:00.000Z',
              status: VERSION_STATUS.CREATED,
              summaryLog: { id: 'log-1', uri: 's3://bucket/key1' }
            }
          }
        ]
      ])

      await repository.appendVersions('org-1', 'reg-1', versionsByKey)

      const result = await repository.findByRegistration('org-1', 'reg-1')
      expect(result).toHaveLength(2)

      const receivedRecord = result.find(
        (r) => r.type === WASTE_RECORD_TYPE.RECEIVED
      )
      const processedRecord = result.find(
        (r) => r.type === WASTE_RECORD_TYPE.PROCESSED
      )

      expect(receivedRecord.data.VALUE).toBe('received-data')
      expect(processedRecord.data.VALUE).toBe('processed-data')
    })

    createTest(
      'partial idempotency - skips already-applied versions, adds new ones',
      async () => {
        // First submission with two records
        const firstSubmission = new Map([
          [
            'received:row-1',
            {
              data: { ROW_ID: 'row-1', VALUE: 'first' },
              version: {
                createdAt: '2025-01-15T10:00:00.000Z',
                status: VERSION_STATUS.CREATED,
                summaryLog: { id: 'log-1', uri: 's3://bucket/key1' }
              }
            }
          ],
          [
            'received:row-2',
            {
              data: { ROW_ID: 'row-2', VALUE: 'second' },
              version: {
                createdAt: '2025-01-15T10:00:00.000Z',
                status: VERSION_STATUS.CREATED,
                summaryLog: { id: 'log-1', uri: 's3://bucket/key1' }
              }
            }
          ]
        ])

        await repository.appendVersions('org-1', 'reg-1', firstSubmission)

        // Simulate partial failure - only row-1 was persisted, now retry with both
        const retrySubmission = new Map([
          [
            'received:row-1',
            {
              data: { ROW_ID: 'row-1', VALUE: 'first' },
              version: {
                createdAt: '2025-01-15T10:00:00.000Z',
                status: VERSION_STATUS.CREATED,
                summaryLog: { id: 'log-1', uri: 's3://bucket/key1' }
              }
            }
          ],
          [
            'received:row-2',
            {
              data: { ROW_ID: 'row-2', VALUE: 'second' },
              version: {
                createdAt: '2025-01-15T10:00:00.000Z',
                status: VERSION_STATUS.CREATED,
                summaryLog: { id: 'log-1', uri: 's3://bucket/key1' }
              }
            }
          ]
        ])

        await repository.appendVersions('org-1', 'reg-1', retrySubmission)

        const result = await repository.findByRegistration('org-1', 'reg-1')
        expect(result).toHaveLength(2)
        expect(result[0].versions).toHaveLength(1) // Not duplicated
        expect(result[1].versions).toHaveLength(1) // Not duplicated
      }
    )
  })
}
