import {
  classifyLoads,
  countValidationResults,
  mergeLoads
} from './classify-loads.js'
import { VERSION_STATUS } from '#domain/waste-records/model.js'

const CURRENT_SUMMARY_LOG_ID = 'current-summary-log'
const PREVIOUS_SUMMARY_LOG_ID = 'previous-summary-log'

/**
 * Creates a transformed record for testing
 * @param {Object} options
 * @param {string} options.status - VERSION_STATUS value
 * @param {string} options.summaryLogId - The summary log ID for the last version
 * @param {Array} options.issues - Validation issues (default empty)
 * @param {string} options.outcome - Outcome from validation pipeline (default 'INCLUDED')
 * @returns {{ record: Object, issues: Array, outcome: string }}
 */
const createValidatedWasteRecord = ({
  status,
  summaryLogId,
  issues = [],
  outcome = 'INCLUDED',
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
  issues,
  outcome
})

describe('classifyLoads', () => {
  describe('with empty data', () => {
    it('returns empty structure when wasteRecords is empty', () => {
      const result = classifyLoads({
        wasteRecords: [],
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result).toEqual({
        added: {
          included: { count: 0, rowIds: [] },
          excluded: { count: 0, rowIds: [] }
        },
        unchanged: {
          included: { count: 0, rowIds: [] },
          excluded: { count: 0, rowIds: [] }
        },
        adjusted: {
          included: { count: 0, rowIds: [] },
          excluded: { count: 0, rowIds: [] }
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

      expect(result.added.included.count).toBe(1)
      expect(result.unchanged.included.count).toBe(0)
      expect(result.adjusted.included.count).toBe(0)
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

      expect(result.adjusted.included.count).toBe(1)
      expect(result.added.included.count).toBe(0)
      expect(result.unchanged.included.count).toBe(0)
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

      expect(result.unchanged.included.count).toBe(1)
      expect(result.added.included.count).toBe(0)
      expect(result.adjusted.included.count).toBe(0)
    })
  })

  describe('inclusion based on outcome', () => {
    it('classifies as included when outcome is INCLUDED', () => {
      const wasteRecords = [
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          issues: [],
          outcome: 'INCLUDED'
        })
      ]

      const result = classifyLoads({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result.added.included.rowIds).toHaveLength(1)
      expect(result.added.excluded.rowIds).toHaveLength(0)
    })

    it('classifies as excluded when outcome is EXCLUDED', () => {
      const wasteRecords = [
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          issues: [{ severity: 'error', message: 'missing required field' }],
          outcome: 'EXCLUDED'
        })
      ]

      const result = classifyLoads({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result.added.excluded.rowIds).toHaveLength(1)
      expect(result.added.included.rowIds).toHaveLength(0)
    })

    it('classifies as excluded when outcome is REJECTED', () => {
      const wasteRecords = [
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          issues: [{ severity: 'error', message: 'invalid row id' }],
          outcome: 'REJECTED'
        })
      ]

      const result = classifyLoads({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result.added.excluded.rowIds).toHaveLength(1)
      expect(result.added.included.rowIds).toHaveLength(0)
    })
  })

  describe('mixed scenarios', () => {
    it('correctly classifies mixed records by inclusion', () => {
      const wasteRecords = [
        // Added, included
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          issues: [],
          outcome: 'INCLUDED'
        }),
        // Added, excluded
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          issues: [{ severity: 'error', message: 'test' }],
          outcome: 'EXCLUDED'
        }),
        // Adjusted, included
        createValidatedWasteRecord({
          status: VERSION_STATUS.UPDATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          issues: [],
          outcome: 'INCLUDED',
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
        // Unchanged, included (previous summary log)
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: PREVIOUS_SUMMARY_LOG_ID,
          issues: []
        }),
        // Unchanged, excluded (previous summary log)
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: PREVIOUS_SUMMARY_LOG_ID,
          issues: [{ severity: 'error', message: 'test' }],
          outcome: 'EXCLUDED'
        })
      ]

      const result = classifyLoads({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result.added.included.rowIds).toHaveLength(1)
      expect(result.added.excluded.rowIds).toHaveLength(1)
      expect(result.unchanged.included.rowIds).toHaveLength(1)
      expect(result.unchanged.excluded.rowIds).toHaveLength(1)
      expect(result.adjusted.included.rowIds).toHaveLength(1)
      expect(result.adjusted.excluded.rowIds).toHaveLength(0)
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
          issues: [],
          outcome: 'INCLUDED'
        }
      ]

      const result = classifyLoads({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      // When summaryLog.id doesn't match (null !== string), should be unchanged
      expect(result.unchanged.included.rowIds).toHaveLength(1)
      expect(result.unchanged.included.rowIds).toContain('row-1')
      expect(result.unchanged.included.count).toBe(1)
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
          issues: [],
          outcome: 'INCLUDED'
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
      // Create 150 records - all added/included
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
        issues: [],
        outcome: 'INCLUDED'
      }))

      const result = classifyLoads({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      // Arrays truncated to 100
      expect(result.added.included.rowIds).toHaveLength(100)
      // Count reflects actual total
      expect(result.added.included.count).toBe(150)

      // First 100 rowIds are present
      expect(result.added.included.rowIds[0]).toBe('row-1')
      expect(result.added.included.rowIds[99]).toBe('row-100')
    })

    it('truncates each category independently', () => {
      // Create 120 added/included and 120 added/excluded records
      const includedRecords = Array.from({ length: 120 }, (_, i) => ({
        record: {
          organisationId: 'org-1',
          registrationId: 'reg-1',
          rowId: `included-${i + 1}`,
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
        issues: [],
        outcome: 'INCLUDED'
      }))

      const excludedRecords = Array.from({ length: 120 }, (_, i) => ({
        record: {
          organisationId: 'org-1',
          registrationId: 'reg-1',
          rowId: `excluded-${i + 1}`,
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
        issues: [{ severity: 'error', message: 'test' }],
        outcome: 'EXCLUDED'
      }))

      const result = classifyLoads({
        wasteRecords: [...includedRecords, ...excludedRecords],
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      // Each array truncated independently
      expect(result.added.included.rowIds).toHaveLength(100)
      expect(result.added.excluded.rowIds).toHaveLength(100)
      // Counts reflect actual totals
      expect(result.added.included.count).toBe(120)
      expect(result.added.excluded.count).toBe(120)
    })
  })
})

describe('countValidationResults', () => {
  describe('with empty data', () => {
    it('returns empty structure when wasteRecords is empty', () => {
      const result = countValidationResults({
        wasteRecords: [],
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result).toEqual({
        added: {
          valid: { count: 0, rowIds: [] },
          invalid: { count: 0, rowIds: [] }
        },
        unchanged: {
          valid: { count: 0, rowIds: [] },
          invalid: { count: 0, rowIds: [] }
        },
        adjusted: {
          valid: { count: 0, rowIds: [] },
          invalid: { count: 0, rowIds: [] }
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

      const result = countValidationResults({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result.added.valid.count).toBe(1)
      expect(result.unchanged.valid.count).toBe(0)
      expect(result.adjusted.valid.count).toBe(0)
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

      const result = countValidationResults({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result.adjusted.valid.count).toBe(1)
      expect(result.added.valid.count).toBe(0)
      expect(result.unchanged.valid.count).toBe(0)
    })

    it('classifies as unchanged when last version summaryLogId does not match current', () => {
      const wasteRecords = [
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: PREVIOUS_SUMMARY_LOG_ID
        })
      ]

      const result = countValidationResults({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result.unchanged.valid.count).toBe(1)
      expect(result.added.valid.count).toBe(0)
      expect(result.adjusted.valid.count).toBe(0)
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

      const result = countValidationResults({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result.added.valid.count).toBe(1)
      expect(result.added.invalid.count).toBe(0)
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

      const result = countValidationResults({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result.added.invalid.count).toBe(1)
      expect(result.added.valid.count).toBe(0)
    })
  })

  describe('skips IGNORED rows', () => {
    it('does not count IGNORED rows', () => {
      const wasteRecords = [
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          outcome: 'IGNORED'
        }),
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          outcome: 'INCLUDED'
        })
      ]

      const result = countValidationResults({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result.added.valid.count).toBe(1)
    })
  })

  describe('truncation', () => {
    it('truncates rowId arrays at 100 but totals reflect full count', () => {
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
        issues: [],
        outcome: 'INCLUDED'
      }))

      const result = countValidationResults({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result.added.valid.rowIds).toHaveLength(100)
      expect(result.added.valid.count).toBe(150)
    })
  })
})

describe('mergeLoads', () => {
  it('merges validation results and classification results into loads', () => {
    const validationResults = {
      added: {
        valid: { count: 3, rowIds: ['r1', 'r2', 'r3'] },
        invalid: { count: 1, rowIds: ['r4'] }
      },
      unchanged: {
        valid: { count: 0, rowIds: [] },
        invalid: { count: 0, rowIds: [] }
      },
      adjusted: {
        valid: { count: 0, rowIds: [] },
        invalid: { count: 0, rowIds: [] }
      }
    }

    const classificationResults = {
      added: {
        included: { count: 2, rowIds: ['r1', 'r2'] },
        excluded: { count: 1, rowIds: ['r3'] }
      },
      unchanged: {
        included: { count: 0, rowIds: [] },
        excluded: { count: 0, rowIds: [] }
      },
      adjusted: {
        included: { count: 0, rowIds: [] },
        excluded: { count: 0, rowIds: [] }
      }
    }

    const result = mergeLoads(validationResults, classificationResults)

    expect(result).toEqual({
      added: {
        valid: { count: 3, rowIds: ['r1', 'r2', 'r3'] },
        invalid: { count: 1, rowIds: ['r4'] },
        included: { count: 2, rowIds: ['r1', 'r2'] },
        excluded: { count: 1, rowIds: ['r3'] }
      },
      unchanged: {
        valid: { count: 0, rowIds: [] },
        invalid: { count: 0, rowIds: [] },
        included: { count: 0, rowIds: [] },
        excluded: { count: 0, rowIds: [] }
      },
      adjusted: {
        valid: { count: 0, rowIds: [] },
        invalid: { count: 0, rowIds: [] },
        included: { count: 0, rowIds: [] },
        excluded: { count: 0, rowIds: [] }
      }
    })
  })
})
