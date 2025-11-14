import { describe, beforeEach, expect } from 'vitest'
import {
  WASTE_RECORD_TYPE,
  VERSION_STATUS
} from '#domain/waste-records/model.js'

export const testAppendVersionsBehaviour = (it) => {
  describe('appendVersions', () => {
    let repository

    beforeEach(async ({ wasteRecordsRepository }) => {
      repository = await wasteRecordsRepository()
    })

    it('creates new waste record with first version', async () => {
      const versionsByKey = new Map([
        [
          'received:row-1',
          {
            data: { VALUE: 'initial' },
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

    it('appends version to existing waste record', async () => {
      // First, create initial record using appendVersions
      const initialVersion = new Map([
        [
          'received:row-1',
          {
            data: { VALUE: 'initial' },
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
            data: { VALUE: 'updated' },
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

    it('is idempotent - resubmitting same summary log does not duplicate versions', async () => {
      // First submission
      const versionsByKey = new Map([
        [
          'received:row-1',
          {
            data: { VALUE: 'initial' },
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
    })

    it('handles multiple records in bulk operation', async () => {
      const versionsByKey = new Map([
        [
          'received:row-1',
          {
            data: { VALUE: 'first' },
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
            data: { VALUE: 'second' },
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
            data: { VALUE: 'third' },
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

    it('handles empty versionsByKey map without error', async () => {
      const versionsByKey = new Map()

      await expect(
        repository.appendVersions('org-1', 'reg-1', versionsByKey)
      ).resolves.not.toThrow()
    })

    it('isolates different record types with same rowId', async () => {
      const versionsByKey = new Map([
        [
          'received:row-1',
          {
            data: { VALUE: 'received-data' },
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
            data: { VALUE: 'processed-data' },
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

    it('partial idempotency - skips already-applied versions, adds new ones', async () => {
      // First submission with two records
      const firstSubmission = new Map([
        [
          'received:row-1',
          {
            data: { VALUE: 'first' },
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
            data: { VALUE: 'second' },
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
            data: { VALUE: 'first' },
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
            data: { VALUE: 'second' },
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
    })

    it('preserves data when resubmitting existing version - idempotent data immutability', async () => {
      // First submission
      const versionsByKey = new Map([
        [
          'received:row-1',
          {
            data: { VALUE: 'original-data' },
            version: {
              createdAt: '2025-01-15T10:00:00.000Z',
              status: VERSION_STATUS.CREATED,
              summaryLog: { id: 'log-1', uri: 's3://bucket/key1' }
            }
          }
        ]
      ])

      await repository.appendVersions('org-1', 'reg-1', versionsByKey)

      // Retry same submission but with different data (simulating replay with corrupted/modified data)
      const retryWithDifferentData = new Map([
        [
          'received:row-1',
          {
            data: { VALUE: 'modified-data-should-not-persist' },
            version: {
              createdAt: '2025-01-15T10:00:00.000Z',
              status: VERSION_STATUS.CREATED,
              summaryLog: { id: 'log-1', uri: 's3://bucket/key1' }
            }
          }
        ]
      ])

      await repository.appendVersions('org-1', 'reg-1', retryWithDifferentData)

      const result = await repository.findByRegistration('org-1', 'reg-1')
      expect(result).toHaveLength(1)
      expect(result[0].data.VALUE).toBe('original-data') // Data must remain unchanged
      expect(result[0].versions).toHaveLength(1) // Version not duplicated
    })

    it('handles mixed bulk operations - new records, appends, and idempotent skips', async () => {
      // Setup: Create one existing record with a version from log-1
      const initialSetup = new Map([
        [
          'received:row-1',
          {
            data: { VALUE: 'existing' },
            version: {
              createdAt: '2025-01-15T10:00:00.000Z',
              status: VERSION_STATUS.CREATED,
              summaryLog: { id: 'log-1', uri: 's3://bucket/key1' }
            }
          }
        ]
      ])

      await repository.appendVersions('org-1', 'reg-1', initialSetup)

      // Now perform mixed operations in one bulk call
      const mixedOperations = new Map([
        // 1. Idempotent skip - already exists with log-1
        [
          'received:row-1',
          {
            data: { VALUE: 'should-not-change' },
            version: {
              createdAt: '2025-01-15T10:00:00.000Z',
              status: VERSION_STATUS.CREATED,
              summaryLog: { id: 'log-1', uri: 's3://bucket/key1' }
            }
          }
        ],
        // 2. Append new version - existing record gets log-2
        [
          'received:row-2',
          {
            data: { VALUE: 'will-get-new-version' },
            version: {
              createdAt: '2025-01-20T10:00:00.000Z',
              status: VERSION_STATUS.UPDATED,
              summaryLog: { id: 'log-2', uri: 's3://bucket/key2' }
            }
          }
        ],
        // 3. Brand new record - creation
        [
          'processed:row-1',
          {
            data: { VALUE: 'brand-new' },
            version: {
              createdAt: '2025-01-20T10:00:00.000Z',
              status: VERSION_STATUS.CREATED,
              summaryLog: { id: 'log-2', uri: 's3://bucket/key2' }
            }
          }
        ]
      ])

      // First create row-2 with log-1 so it can get an append
      await repository.appendVersions(
        'org-1',
        'reg-1',
        new Map([
          [
            'received:row-2',
            {
              data: { VALUE: 'initial' },
              version: {
                createdAt: '2025-01-15T10:00:00.000Z',
                status: VERSION_STATUS.CREATED,
                summaryLog: { id: 'log-1', uri: 's3://bucket/key1' }
              }
            }
          ]
        ])
      )

      await repository.appendVersions('org-1', 'reg-1', mixedOperations)

      const result = await repository.findByRegistration('org-1', 'reg-1')
      expect(result).toHaveLength(3)

      const row1 = result.find(
        (r) => r.rowId === 'row-1' && r.type === 'received'
      )
      const row2 = result.find(
        (r) => r.rowId === 'row-2' && r.type === 'received'
      )
      const row3 = result.find(
        (r) => r.rowId === 'row-1' && r.type === 'processed'
      )

      // 1. Idempotent skip - data unchanged, version not duplicated
      expect(row1.data.VALUE).toBe('existing')
      expect(row1.versions).toHaveLength(1)
      expect(row1.versions[0].summaryLog.id).toBe('log-1')

      // 2. Append - now has both log-1 and log-2
      expect(row2.data.VALUE).toBe('will-get-new-version')
      expect(row2.versions).toHaveLength(2)
      expect(row2.versions[0].summaryLog.id).toBe('log-1')
      expect(row2.versions[1].summaryLog.id).toBe('log-2')

      // 3. Brand new record
      expect(row3.data.VALUE).toBe('brand-new')
      expect(row3.versions).toHaveLength(1)
      expect(row3.versions[0].summaryLog.id).toBe('log-2')
    })

    it('isolates records across different organisations', async () => {
      const versionsByKey = new Map([
        [
          'received:row-1',
          {
            data: { VALUE: 'org-1-data' },
            version: {
              createdAt: '2025-01-15T10:00:00.000Z',
              status: VERSION_STATUS.CREATED,
              summaryLog: { id: 'log-1', uri: 's3://bucket/key1' }
            }
          }
        ]
      ])

      // Create same rowId and type for two different organisations
      await repository.appendVersions('org-1', 'reg-1', versionsByKey)

      const org2VersionsByKey = new Map([
        [
          'received:row-1',
          {
            data: { VALUE: 'org-2-data' },
            version: {
              createdAt: '2025-01-15T10:00:00.000Z',
              status: VERSION_STATUS.CREATED,
              summaryLog: { id: 'log-2', uri: 's3://bucket/key2' }
            }
          }
        ]
      ])

      await repository.appendVersions('org-2', 'reg-1', org2VersionsByKey)

      // Verify org-1 only sees its own data
      const org1Result = await repository.findByRegistration('org-1', 'reg-1')
      expect(org1Result).toHaveLength(1)
      expect(org1Result[0].data.VALUE).toBe('org-1-data')
      expect(org1Result[0].versions[0].summaryLog.id).toBe('log-1')

      // Verify org-2 only sees its own data
      const org2Result = await repository.findByRegistration('org-2', 'reg-1')
      expect(org2Result).toHaveLength(1)
      expect(org2Result[0].data.VALUE).toBe('org-2-data')
      expect(org2Result[0].versions[0].summaryLog.id).toBe('log-2')
    })

    it('maintains version array in persistence order, not chronological order', async () => {
      // First submission with earlier timestamp
      const firstVersion = new Map([
        [
          'received:row-1',
          {
            data: { VALUE: 'first' },
            version: {
              createdAt: '2025-01-20T10:00:00.000Z', // Later timestamp
              status: VERSION_STATUS.CREATED,
              summaryLog: { id: 'log-1', uri: 's3://bucket/key1' }
            }
          }
        ]
      ])

      await repository.appendVersions('org-1', 'reg-1', firstVersion)

      // Second submission with later timestamp but earlier createdAt
      const secondVersion = new Map([
        [
          'received:row-1',
          {
            data: { VALUE: 'second' },
            version: {
              createdAt: '2025-01-15T10:00:00.000Z', // Earlier timestamp
              status: VERSION_STATUS.UPDATED,
              summaryLog: { id: 'log-2', uri: 's3://bucket/key2' }
            }
          }
        ]
      ])

      await repository.appendVersions('org-1', 'reg-1', secondVersion)

      const result = await repository.findByRegistration('org-1', 'reg-1')
      expect(result).toHaveLength(1)
      expect(result[0].versions).toHaveLength(2)

      // Versions should be in persistence order (log-1 first, log-2 second)
      // NOT chronological order (which would be log-2 first due to earlier createdAt)
      expect(result[0].versions[0].summaryLog.id).toBe('log-1')
      expect(result[0].versions[0].createdAt).toBe('2025-01-20T10:00:00.000Z')
      expect(result[0].versions[1].summaryLog.id).toBe('log-2')
      expect(result[0].versions[1].createdAt).toBe('2025-01-15T10:00:00.000Z')
    })
  })
}
