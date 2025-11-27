import { classifyLoads } from './classify-loads.js'
import { VERSION_STATUS } from '#domain/waste-records/model.js'

const CURRENT_SUMMARY_LOG_ID = 'current-summary-log'
const PREVIOUS_SUMMARY_LOG_ID = 'previous-summary-log'

/**
 * Creates a transformed record for testing
 * @param {Object} options
 * @param {string} options.status - VERSION_STATUS value
 * @param {string} options.summaryLogId - The summary log ID for the last version
 * @param {Array} options.issues - Validation issues (default empty)
 * @returns {{ record: Object, issues: Array }}
 */
const createValidatedWasteRecord = ({
  status,
  summaryLogId,
  issues = [],
  previousVersions = []
}) => ({
  record: {
    organisationId: 'org-1',
    registrationId: 'reg-1',
    rowId: `row-${Math.random().toString(36).substring(7)}`,
    type: 'received',
    data: { ROW_ID: '10001' },
    versions: [
      ...previousVersions,
      {
        createdAt: new Date().toISOString(),
        status,
        summaryLog: { id: summaryLogId, uri: 's3://bucket/key' },
        data: { ROW_ID: '10001' }
      }
    ]
  },
  issues
})

describe('classifyLoads', () => {
  describe('with empty data', () => {
    it('returns empty arrays and zero totals when wasteRecords is empty', () => {
      const result = classifyLoads({
        wasteRecords: [],
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result).toEqual({
        added: { valid: [], invalid: [] },
        unchanged: { valid: [], invalid: [] },
        adjusted: { valid: [], invalid: [] },
        totals: {
          added: { valid: 0, invalid: 0 },
          unchanged: { valid: 0, invalid: 0 },
          adjusted: { valid: 0, invalid: 0 }
        }
      })
    })
  })

  describe('classification based on version status', () => {
    it('classifies as added when last version has CREATED status and matches current summaryLogId', () => {
      const wasteRecords = [
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID
        })
      ]

      const result = classifyLoads({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result.added.valid).toHaveLength(1)
      expect(result.unchanged.valid).toHaveLength(0)
      expect(result.adjusted.valid).toHaveLength(0)
      expect(result.totals.added.valid).toBe(1)
    })

    it('classifies as adjusted when last version has UPDATED status and matches current summaryLogId', () => {
      const wasteRecords = [
        createValidatedWasteRecord({
          status: VERSION_STATUS.UPDATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          previousVersions: [
            {
              createdAt: '2025-01-01T00:00:00.000Z',
              status: VERSION_STATUS.CREATED,
              summaryLog: {
                id: PREVIOUS_SUMMARY_LOG_ID,
                uri: 's3://bucket/old-key'
              },
              data: { ROW_ID: '10001' }
            }
          ]
        })
      ]

      const result = classifyLoads({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result.adjusted.valid).toHaveLength(1)
      expect(result.added.valid).toHaveLength(0)
      expect(result.unchanged.valid).toHaveLength(0)
      expect(result.totals.adjusted.valid).toBe(1)
    })

    it('classifies as unchanged when last version summaryLogId does not match current', () => {
      const wasteRecords = [
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: PREVIOUS_SUMMARY_LOG_ID
        })
      ]

      const result = classifyLoads({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result.unchanged.valid).toHaveLength(1)
      expect(result.added.valid).toHaveLength(0)
      expect(result.adjusted.valid).toHaveLength(0)
      expect(result.totals.unchanged.valid).toBe(1)
    })
  })

  describe('validity based on issues', () => {
    it('classifies as valid when issues array is empty', () => {
      const wasteRecords = [
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          issues: []
        })
      ]

      const result = classifyLoads({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result.added.valid).toHaveLength(1)
      expect(result.added.invalid).toHaveLength(0)
    })

    it('classifies as invalid when issues array has items', () => {
      const wasteRecords = [
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          issues: [
            {
              severity: 'error',
              category: 'TECHNICAL',
              message: 'Invalid value',
              code: 'INVALID_TYPE',
              context: {}
            }
          ]
        })
      ]

      const result = classifyLoads({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result.added.invalid).toHaveLength(1)
      expect(result.added.valid).toHaveLength(0)
    })

    it('classifies adjusted records as invalid when they have issues', () => {
      const wasteRecords = [
        createValidatedWasteRecord({
          status: VERSION_STATUS.UPDATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          issues: [{ severity: 'error', message: 'test' }],
          previousVersions: [
            {
              createdAt: '2025-01-01T00:00:00.000Z',
              status: VERSION_STATUS.CREATED,
              summaryLog: {
                id: PREVIOUS_SUMMARY_LOG_ID,
                uri: 's3://bucket/old-key'
              },
              data: { ROW_ID: '10001' }
            }
          ]
        })
      ]

      const result = classifyLoads({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result.adjusted.invalid).toHaveLength(1)
      expect(result.adjusted.valid).toHaveLength(0)
    })
  })

  describe('mixed scenarios', () => {
    it('correctly classifies mixed records and returns rowIds in correct arrays', () => {
      const wasteRecords = [
        // Added, valid
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          issues: []
        }),
        // Added, invalid
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          issues: [{ severity: 'error', message: 'test' }]
        }),
        // Adjusted, valid
        createValidatedWasteRecord({
          status: VERSION_STATUS.UPDATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          issues: [],
          previousVersions: [
            {
              createdAt: '2025-01-01T00:00:00.000Z',
              status: VERSION_STATUS.CREATED,
              summaryLog: {
                id: PREVIOUS_SUMMARY_LOG_ID,
                uri: 's3://bucket/old-key'
              },
              data: {}
            }
          ]
        }),
        // Unchanged, valid (previous summary log)
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: PREVIOUS_SUMMARY_LOG_ID,
          issues: []
        }),
        // Unchanged, invalid (previous summary log with issues)
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: PREVIOUS_SUMMARY_LOG_ID,
          issues: [{ severity: 'error', message: 'test' }]
        })
      ]

      const result = classifyLoads({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result.added.valid).toHaveLength(1)
      expect(result.added.invalid).toHaveLength(1)
      expect(result.unchanged.valid).toHaveLength(1)
      expect(result.unchanged.invalid).toHaveLength(1)
      expect(result.adjusted.valid).toHaveLength(1)
      expect(result.adjusted.invalid).toHaveLength(0)

      // Verify rowIds are strings (from records)
      expect(result.added.valid[0]).toMatch(/^row-/)
      expect(result.added.invalid[0]).toMatch(/^row-/)
      expect(result.adjusted.valid[0]).toMatch(/^row-/)
      expect(result.unchanged.valid[0]).toMatch(/^row-/)
      expect(result.unchanged.invalid[0]).toMatch(/^row-/)
    })
  })

  describe('edge cases', () => {
    it('handles record with missing summaryLog gracefully (classifies as unchanged)', () => {
      const wasteRecords = [
        {
          record: {
            organisationId: 'org-1',
            registrationId: 'reg-1',
            rowId: 'row-1',
            type: 'received',
            data: {},
            versions: [
              {
                createdAt: new Date().toISOString(),
                status: VERSION_STATUS.CREATED,
                summaryLog: null, // Missing summaryLog
                data: {}
              }
            ]
          },
          issues: []
        }
      ]

      const result = classifyLoads({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      // When summaryLog.id doesn't match (null !== string), should be unchanged
      expect(result.unchanged.valid).toHaveLength(1)
      expect(result.unchanged.valid).toContain('row-1')
      expect(result.totals.unchanged.valid).toBe(1)
    })

    it('handles empty versions array gracefully', () => {
      const wasteRecords = [
        {
          record: {
            organisationId: 'org-1',
            registrationId: 'reg-1',
            rowId: 'row-1',
            type: 'received',
            data: {},
            versions: []
          },
          issues: []
        }
      ]

      // This would throw due to accessing versions[-1]
      // But this is an invalid state that shouldn't occur in practice
      expect(() =>
        classifyLoads({
          wasteRecords,
          summaryLogId: CURRENT_SUMMARY_LOG_ID
        })
      ).toThrow()
    })
  })

  describe('truncation', () => {
    it('truncates rowId arrays at 100 but totals reflect full count', () => {
      // Create 150 records - all added/valid
      const wasteRecords = Array.from({ length: 150 }, (_, i) => ({
        record: {
          organisationId: 'org-1',
          registrationId: 'reg-1',
          rowId: `row-${i + 1}`,
          type: 'received',
          data: {},
          versions: [
            {
              createdAt: new Date().toISOString(),
              status: VERSION_STATUS.CREATED,
              summaryLog: {
                id: CURRENT_SUMMARY_LOG_ID,
                uri: 's3://bucket/key'
              },
              data: {}
            }
          ]
        },
        issues: []
      }))

      const result = classifyLoads({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      // Arrays truncated to 100
      expect(result.added.valid).toHaveLength(100)
      // Totals reflect actual count
      expect(result.totals.added.valid).toBe(150)

      // First 100 rowIds are included
      expect(result.added.valid[0]).toBe('row-1')
      expect(result.added.valid[99]).toBe('row-100')
    })

    it('truncates each category independently', () => {
      // Create 120 added/valid and 120 added/invalid records
      const validRecords = Array.from({ length: 120 }, (_, i) => ({
        record: {
          organisationId: 'org-1',
          registrationId: 'reg-1',
          rowId: `valid-${i + 1}`,
          type: 'received',
          data: {},
          versions: [
            {
              createdAt: new Date().toISOString(),
              status: VERSION_STATUS.CREATED,
              summaryLog: {
                id: CURRENT_SUMMARY_LOG_ID,
                uri: 's3://bucket/key'
              },
              data: {}
            }
          ]
        },
        issues: []
      }))

      const invalidRecords = Array.from({ length: 120 }, (_, i) => ({
        record: {
          organisationId: 'org-1',
          registrationId: 'reg-1',
          rowId: `invalid-${i + 1}`,
          type: 'received',
          data: {},
          versions: [
            {
              createdAt: new Date().toISOString(),
              status: VERSION_STATUS.CREATED,
              summaryLog: {
                id: CURRENT_SUMMARY_LOG_ID,
                uri: 's3://bucket/key'
              },
              data: {}
            }
          ]
        },
        issues: [{ severity: 'error', message: 'test' }]
      }))

      const result = classifyLoads({
        wasteRecords: [...validRecords, ...invalidRecords],
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      // Each array truncated independently
      expect(result.added.valid).toHaveLength(100)
      expect(result.added.invalid).toHaveLength(100)
      // Totals reflect actual counts
      expect(result.totals.added.valid).toBe(120)
      expect(result.totals.added.invalid).toBe(120)
    })
  })
})
