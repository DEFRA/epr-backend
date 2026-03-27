import {
  countByWasteBalanceInclusion,
  countByValidity,
  mergeLoads
} from './load-counts.js'
import {
  VERSION_STATUS,
  WASTE_RECORD_TYPE
} from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

const CURRENT_SUMMARY_LOG_ID = 'current-summary-log'
const PREVIOUS_SUMMARY_LOG_ID = 'previous-summary-log'

/**
 * Creates a transformed record for testing
 * @param {Object} options
 * @param {string} options.status - VERSION_STATUS value
 * @param {string} options.summaryLogId - The summary log ID for the last version
 * @param {Array} [options.issues] - Validation issues (default empty)
 * @param {import('#domain/summary-logs/table-schemas/validation-pipeline.js').RowOutcome} [options.outcome] - Outcome from validation pipeline (default 'INCLUDED')
 * @param {Array} [options.previousVersions] - Previous versions to prepend (default empty)
 * @param {import('#application/waste-records/transform-from-summary-log.js').WasteRecordChange} [options.change] - What happened to this record (default 'created')
 * @returns {import('#application/waste-records/transform-from-summary-log.js').ValidatedWasteRecord}
 */
const createValidatedWasteRecord = ({
  status,
  summaryLogId,
  issues = [],
  outcome = ROW_OUTCOME.INCLUDED,
  previousVersions = [],
  change = 'created'
}) => ({
  record: {
    organisationId: 'org-1',
    registrationId: 'reg-1',
    rowId: `row-${Math.random().toString(36).substring(7)}`,
    type: WASTE_RECORD_TYPE.RECEIVED,
    data: { ROW_ID: '10001' },
    versions: [
      ...previousVersions,
      {
        id: `ver-${Math.random().toString(36).substring(7)}`,
        createdAt: new Date().toISOString(),
        status,
        summaryLog: { id: summaryLogId, uri: 's3://bucket/key' },
        data: { ROW_ID: '10001' }
      }
    ]
  },
  issues,
  outcome,
  change
})

describe('countByWasteBalanceInclusion', () => {
  describe('with empty data', () => {
    it('returns empty structure when wasteRecords is empty', () => {
      const result = countByWasteBalanceInclusion({
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

      const result = countByWasteBalanceInclusion({
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
              id: 'prev-ver-1',
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

      const result = countByWasteBalanceInclusion({
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

      const result = countByWasteBalanceInclusion({
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
          outcome: ROW_OUTCOME.INCLUDED
        })
      ]

      const result = countByWasteBalanceInclusion({
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
          issues: [
            {
              severity: 'error',
              category: 'TECHNICAL',
              message: 'missing required field',
              code: 'MISSING_FIELD'
            }
          ],
          outcome: ROW_OUTCOME.EXCLUDED
        })
      ]

      const result = countByWasteBalanceInclusion({
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
          issues: [
            {
              severity: 'error',
              category: 'TECHNICAL',
              message: 'invalid row id',
              code: 'INVALID_ROW_ID'
            }
          ],
          outcome: ROW_OUTCOME.REJECTED
        })
      ]

      const result = countByWasteBalanceInclusion({
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
          outcome: ROW_OUTCOME.INCLUDED
        }),
        // Added, excluded
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          issues: [
            {
              severity: 'error',
              category: 'TECHNICAL',
              message: 'test',
              code: 'TEST_ERROR'
            }
          ],
          outcome: ROW_OUTCOME.EXCLUDED
        }),
        // Adjusted, included
        createValidatedWasteRecord({
          status: VERSION_STATUS.UPDATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          issues: [],
          outcome: ROW_OUTCOME.INCLUDED,
          previousVersions: [
            {
              id: 'prev-ver-1',
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
          issues: [
            {
              severity: 'error',
              category: 'TECHNICAL',
              message: 'test',
              code: 'TEST_ERROR'
            }
          ],
          outcome: ROW_OUTCOME.EXCLUDED
        })
      ]

      const result = countByWasteBalanceInclusion({
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

  describe('skips IGNORED rows (suspended accreditation silent exclusion)', () => {
    it('does not count IGNORED rows in any category', () => {
      const wasteRecords = [
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          outcome: ROW_OUTCOME.IGNORED
        }),
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          outcome: ROW_OUTCOME.INCLUDED
        })
      ]

      const result = countByWasteBalanceInclusion({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result.added.included.count).toBe(1)
      expect(result.added.excluded.count).toBe(0)
    })

    it('silently excludes IGNORED rows across added, adjusted, and unchanged categories', () => {
      const wasteRecords = [
        // Added, IGNORED (suspended accreditation)
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          outcome: ROW_OUTCOME.IGNORED
        }),
        // Adjusted, IGNORED (suspended accreditation)
        createValidatedWasteRecord({
          status: VERSION_STATUS.UPDATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          outcome: ROW_OUTCOME.IGNORED,
          previousVersions: [
            {
              id: 'prev-ver-1',
              createdAt: '2025-01-01T00:00:00.000Z',
              status: VERSION_STATUS.CREATED,
              summaryLog: {
                id: PREVIOUS_SUMMARY_LOG_ID,
                uri: 's3://bucket/old-key'
              },
              data: { ROW_ID: '10001' }
            }
          ]
        }),
        // Unchanged, IGNORED (suspended accreditation)
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: PREVIOUS_SUMMARY_LOG_ID,
          outcome: ROW_OUTCOME.IGNORED
        }),
        // Added, INCLUDED (not suspended)
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          outcome: ROW_OUTCOME.INCLUDED
        })
      ]

      const result = countByWasteBalanceInclusion({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      // Only the non-IGNORED record should appear
      expect(result.added.included.count).toBe(1)
      expect(result.added.excluded.count).toBe(0)
      expect(result.adjusted.included.count).toBe(0)
      expect(result.adjusted.excluded.count).toBe(0)
      expect(result.unchanged.included.count).toBe(0)
      expect(result.unchanged.excluded.count).toBe(0)
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
            type: WASTE_RECORD_TYPE.RECEIVED,
            data: {},
            versions: [
              {
                id: 'ver-1',
                createdAt: new Date().toISOString(),
                status: VERSION_STATUS.CREATED,
                summaryLog: null, // Missing summaryLog
                data: {}
              }
            ]
          },
          issues: [],
          outcome: ROW_OUTCOME.INCLUDED,
          change: /** @type {const} */ ('created')
        }
      ]

      const result = countByWasteBalanceInclusion({
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
            type: WASTE_RECORD_TYPE.RECEIVED,
            data: {},
            versions: []
          },
          issues: [],
          outcome: ROW_OUTCOME.INCLUDED,
          change: /** @type {const} */ ('created')
        }
      ]

      // This would throw due to accessing versions[-1]
      // But this is an invalid state that shouldn't occur in practice
      expect(() =>
        countByWasteBalanceInclusion({
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
          type: WASTE_RECORD_TYPE.RECEIVED,
          data: {},
          versions: [
            {
              id: `ver-${i + 1}`,
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
        outcome: ROW_OUTCOME.INCLUDED,
        change: /** @type {const} */ ('created')
      }))

      const result = countByWasteBalanceInclusion({
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
          type: WASTE_RECORD_TYPE.RECEIVED,
          data: {},
          versions: [
            {
              id: `ver-${i + 1}`,
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
        outcome: ROW_OUTCOME.INCLUDED,
        change: /** @type {const} */ ('created')
      }))

      const excludedRecords = Array.from({ length: 120 }, (_, i) => ({
        record: {
          organisationId: 'org-1',
          registrationId: 'reg-1',
          rowId: `excluded-${i + 1}`,
          type: WASTE_RECORD_TYPE.RECEIVED,
          data: {},
          versions: [
            {
              id: `ver-${i + 1}`,
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
        issues: [
          {
            severity: 'error',
            category: 'TECHNICAL',
            message: 'test',
            code: 'TEST_ERROR'
          }
        ],
        outcome: ROW_OUTCOME.EXCLUDED,
        change: /** @type {const} */ ('created')
      }))

      const result = countByWasteBalanceInclusion({
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

describe('countByValidity', () => {
  describe('with empty data', () => {
    it('returns empty structure when wasteRecords is empty', () => {
      const result = countByValidity({
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

      const result = countByValidity({
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
              id: 'prev-ver-1',
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

      const result = countByValidity({
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

      const result = countByValidity({
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

      const result = countByValidity({
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

      const result = countByValidity({
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
          outcome: ROW_OUTCOME.IGNORED
        }),
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          outcome: ROW_OUTCOME.INCLUDED
        })
      ]

      const result = countByValidity({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result.added.valid.count).toBe(1)
    })

    it('silently excludes IGNORED rows across added, adjusted, and unchanged categories', () => {
      const wasteRecords = [
        // Added, IGNORED
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          outcome: ROW_OUTCOME.IGNORED
        }),
        // Adjusted, IGNORED
        createValidatedWasteRecord({
          status: VERSION_STATUS.UPDATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          outcome: ROW_OUTCOME.IGNORED,
          previousVersions: [
            {
              id: 'prev-ver-1',
              createdAt: '2025-01-01T00:00:00.000Z',
              status: VERSION_STATUS.CREATED,
              summaryLog: {
                id: PREVIOUS_SUMMARY_LOG_ID,
                uri: 's3://bucket/old-key'
              },
              data: { ROW_ID: '10001' }
            }
          ]
        }),
        // Unchanged, IGNORED
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: PREVIOUS_SUMMARY_LOG_ID,
          outcome: ROW_OUTCOME.IGNORED
        }),
        // Added, INCLUDED (not ignored)
        createValidatedWasteRecord({
          status: VERSION_STATUS.CREATED,
          summaryLogId: CURRENT_SUMMARY_LOG_ID,
          outcome: ROW_OUTCOME.INCLUDED
        })
      ]

      const result = countByValidity({
        wasteRecords,
        summaryLogId: CURRENT_SUMMARY_LOG_ID
      })

      expect(result.added.valid.count).toBe(1)
      expect(result.added.invalid.count).toBe(0)
      expect(result.adjusted.valid.count).toBe(0)
      expect(result.adjusted.invalid.count).toBe(0)
      expect(result.unchanged.valid.count).toBe(0)
      expect(result.unchanged.invalid.count).toBe(0)
    })
  })

  describe('truncation', () => {
    it('truncates rowId arrays at 100 but totals reflect full count', () => {
      const wasteRecords = Array.from({ length: 150 }, (_, i) => ({
        record: {
          organisationId: 'org-1',
          registrationId: 'reg-1',
          rowId: `row-${i + 1}`,
          type: WASTE_RECORD_TYPE.RECEIVED,
          data: {},
          versions: [
            {
              id: `ver-${i + 1}`,
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
        outcome: ROW_OUTCOME.INCLUDED,
        change: /** @type {const} */ ('created')
      }))

      const result = countByValidity({
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
