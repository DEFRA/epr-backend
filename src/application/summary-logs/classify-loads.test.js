import { classifyLoads, getRowId } from './classify-loads.js'

describe('classifyLoads', () => {
  describe('with empty data', () => {
    it('returns zero counts when parsed data is empty', () => {
      const result = classifyLoads({
        parsed: { data: {} },
        issues: [],
        existingWasteRecords: []
      })

      expect(result).toEqual({
        new: { valid: 0, invalid: 0 },
        unchanged: { valid: 0, invalid: 0 },
        adjusted: { valid: 0, invalid: 0 }
      })
    })

    it('returns zero counts when parsed is null', () => {
      const result = classifyLoads({
        parsed: null,
        issues: [],
        existingWasteRecords: []
      })

      expect(result).toEqual({
        new: { valid: 0, invalid: 0 },
        unchanged: { valid: 0, invalid: 0 },
        adjusted: { valid: 0, invalid: 0 }
      })
    })
  })

  describe('with new loads (first submission)', () => {
    const parsed = {
      meta: {},
      data: {
        UPDATE_WASTE_BALANCE: {
          location: { sheet: 'Received', row: 7, column: 'B' },
          headers: [
            'OUR_REFERENCE',
            'DATE_RECEIVED',
            'EWC_CODE',
            'GROSS_WEIGHT',
            'TARE_WEIGHT',
            'PALLET_WEIGHT',
            'NET_WEIGHT',
            'BAILING_WIRE',
            'HOW_CALCULATE_RECYCLABLE',
            'WEIGHT_OF_NON_TARGET',
            'RECYCLABLE_PROPORTION',
            'TONNAGE_RECEIVED_FOR_EXPORT'
          ],
          rows: [
            [
              10000,
              '2025-05-28T00:00:00.000Z',
              '03 03 08',
              1000,
              100,
              50,
              850,
              'YES',
              'WEIGHT',
              50,
              0.85,
              850
            ],
            [
              9999,
              'invalid-date',
              'bad-code',
              1000,
              100,
              50,
              850,
              'YES',
              'WEIGHT',
              50,
              0.85,
              850
            ]
          ]
        }
      }
    }

    it('classifies all rows as new when no existing records', () => {
      const result = classifyLoads({
        parsed,
        issues: [],
        existingWasteRecords: []
      })

      expect(result.new.valid).toBe(2)
      expect(result.new.invalid).toBe(0)
      expect(result.unchanged).toEqual({ valid: 0, invalid: 0 })
      expect(result.adjusted).toEqual({ valid: 0, invalid: 0 })
    })

    it('classifies rows with validation errors as invalid', () => {
      const issues = [
        {
          severity: 'error',
          context: {
            location: {
              sheet: 'Received',
              table: 'UPDATE_WASTE_BALANCE',
              row: 9,
              column: 'B',
              header: 'OUR_REFERENCE'
            },
            actual: 9999
          }
        },
        {
          severity: 'error',
          context: {
            location: {
              sheet: 'Received',
              table: 'UPDATE_WASTE_BALANCE',
              row: 9,
              column: 'C',
              header: 'DATE_RECEIVED'
            },
            actual: 'invalid-date'
          }
        },
        {
          severity: 'error',
          context: {
            location: {
              sheet: 'Received',
              table: 'UPDATE_WASTE_BALANCE',
              row: 9,
              column: 'D',
              header: 'EWC_CODE'
            },
            actual: 'bad-code'
          }
        }
      ]

      const result = classifyLoads({
        parsed,
        issues,
        existingWasteRecords: []
      })

      expect(result).toEqual({
        new: { valid: 1, invalid: 1 },
        unchanged: { valid: 0, invalid: 0 },
        adjusted: { valid: 0, invalid: 0 }
      })
    })
  })

  describe('with existing records', () => {
    const parsed = {
      meta: {},
      data: {
        UPDATE_WASTE_BALANCE: {
          location: { sheet: 'Received', row: 7, column: 'B' },
          headers: ['OUR_REFERENCE', 'DATE_RECEIVED', 'EWC_CODE'],
          rows: [
            ['10001', '2025-05-28', '03 03 08'],
            ['10002', '2025-05-29', '03 03 09'],
            ['10003', '2025-05-30', '03 03 10']
          ]
        }
      }
    }

    it('classifies rows with matching row IDs as unchanged when data is same', () => {
      const existingWasteRecords = [
        {
          type: 'received',
          rowId: '10001',
          data: {
            OUR_REFERENCE: '10001',
            DATE_RECEIVED: '2025-05-28',
            EWC_CODE: '03 03 08'
          }
        }
      ]

      const result = classifyLoads({
        parsed,
        issues: [],
        existingWasteRecords
      })

      expect(result.unchanged.valid).toBe(1)
      expect(result.new.valid).toBe(2)
    })

    it('classifies rows with matching row IDs as adjusted when data differs', () => {
      const existingWasteRecords = [
        {
          type: 'received',
          rowId: '10001',
          data: {
            OUR_REFERENCE: '10001',
            DATE_RECEIVED: '2025-01-01',
            EWC_CODE: '03 03 08'
          }
        }
      ]

      const result = classifyLoads({
        parsed,
        issues: [],
        existingWasteRecords
      })

      expect(result.adjusted.valid).toBe(1)
      expect(result.new.valid).toBe(2)
    })

    it('handles multiple existing records of the same type', () => {
      const existingWasteRecords = [
        {
          type: 'received',
          rowId: '10001',
          data: {
            OUR_REFERENCE: '10001',
            DATE_RECEIVED: '2025-05-28',
            EWC_CODE: '03 03 08'
          }
        },
        {
          type: 'received',
          rowId: '10002',
          data: {
            OUR_REFERENCE: '10002',
            DATE_RECEIVED: '2025-05-29',
            EWC_CODE: '03 03 09'
          }
        }
      ]

      const result = classifyLoads({
        parsed,
        issues: [],
        existingWasteRecords
      })

      // Two rows match existing records (unchanged), one is new
      expect(result.unchanged.valid).toBe(2)
      expect(result.new.valid).toBe(1)
    })
  })

  describe('skips unknown tables', () => {
    it('does not count rows from tables without schemas', () => {
      const parsed = {
        meta: {},
        data: {
          UNKNOWN_TABLE: {
            location: { sheet: 'Unknown', row: 1, column: 'A' },
            headers: ['FIELD_A', 'FIELD_B'],
            rows: [['value1', 'value2']]
          }
        }
      }

      const result = classifyLoads({
        parsed,
        issues: [],
        existingWasteRecords: []
      })

      expect(result).toEqual({
        new: { valid: 0, invalid: 0 },
        unchanged: { valid: 0, invalid: 0 },
        adjusted: { valid: 0, invalid: 0 }
      })
    })
  })

  describe('edge cases in validation issue processing', () => {
    const parsed = {
      meta: {},
      data: {
        UPDATE_WASTE_BALANCE: {
          location: { sheet: 'Received', row: 7, column: 'B' },
          headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
          rows: [['10001', '2025-05-28']]
        }
      }
    }

    it('ignores issues without location context', () => {
      const issues = [
        { severity: 'error', context: {} },
        { severity: 'error', context: { location: null } }
      ]

      const result = classifyLoads({
        parsed,
        issues,
        existingWasteRecords: []
      })

      // Row should still be valid since issues without location are ignored
      expect(result.new.valid).toBe(1)
      expect(result.new.invalid).toBe(0)
    })

    it('ignores issues without table in location', () => {
      const issues = [
        {
          severity: 'error',
          context: {
            location: { sheet: 'Received', row: 8, column: 'B' }
            // No table property
          }
        }
      ]

      const result = classifyLoads({
        parsed,
        issues,
        existingWasteRecords: []
      })

      expect(result.new.valid).toBe(1)
      expect(result.new.invalid).toBe(0)
    })

    it('ignores issues without row in location', () => {
      const issues = [
        {
          severity: 'error',
          context: {
            location: {
              sheet: 'Received',
              table: 'UPDATE_WASTE_BALANCE',
              column: 'B'
            }
            // No row property
          }
        }
      ]

      const result = classifyLoads({
        parsed,
        issues,
        existingWasteRecords: []
      })

      expect(result.new.valid).toBe(1)
      expect(result.new.invalid).toBe(0)
    })

    it('ignores issues referencing tables not in parsed data', () => {
      const issues = [
        {
          severity: 'error',
          context: {
            location: {
              sheet: 'Other',
              table: 'NONEXISTENT_TABLE',
              row: 8,
              column: 'B'
            }
          }
        }
      ]

      const result = classifyLoads({
        parsed,
        issues,
        existingWasteRecords: []
      })

      expect(result.new.valid).toBe(1)
      expect(result.new.invalid).toBe(0)
    })

    it('ignores issues referencing tables without location metadata', () => {
      const parsedWithMissingLocation = {
        meta: {},
        data: {
          UPDATE_WASTE_BALANCE: {
            // No location property
            headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
            rows: [['10001', '2025-05-28']]
          }
        }
      }

      const issues = [
        {
          severity: 'error',
          context: {
            location: {
              sheet: 'Received',
              table: 'UPDATE_WASTE_BALANCE',
              row: 8,
              column: 'B'
            }
          }
        }
      ]

      const result = classifyLoads({
        parsed: parsedWithMissingLocation,
        issues,
        existingWasteRecords: []
      })

      // Row still counted but issue can't be mapped without location.row
      expect(result.new.valid).toBe(1)
    })

    it('ignores issues with row index before header row', () => {
      const issues = [
        {
          severity: 'error',
          context: {
            location: {
              sheet: 'Received',
              table: 'UPDATE_WASTE_BALANCE',
              row: 6, // Row 6 is before header row 7, so rowIndex would be negative
              column: 'B'
            }
          }
        }
      ]

      const result = classifyLoads({
        parsed,
        issues,
        existingWasteRecords: []
      })

      // Row should still be valid since issue with negative row index is ignored
      expect(result.new.valid).toBe(1)
      expect(result.new.invalid).toBe(0)
    })
  })

  describe('edge cases in existing record comparison', () => {
    const parsed = {
      meta: {},
      data: {
        UPDATE_WASTE_BALANCE: {
          location: { sheet: 'Received', row: 7, column: 'B' },
          headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
          rows: [['10001', '2025-05-28']]
        }
      }
    }

    it('classifies as unchanged when existing record has undefined data', () => {
      const existingWasteRecords = [
        {
          type: 'received',
          rowId: '10001',
          data: undefined
        }
      ]

      const result = classifyLoads({
        parsed,
        issues: [],
        existingWasteRecords
      })

      // When existing data is undefined, hasRowChanged returns false
      // so the row is classified as unchanged
      expect(result.unchanged.valid).toBe(1)
      expect(result.adjusted.valid).toBe(0)
    })

    it('handles null existingWasteRecords gracefully', () => {
      const result = classifyLoads({
        parsed,
        issues: [],
        existingWasteRecords: null
      })

      // All rows should be classified as new since there are no existing records
      expect(result.new.valid).toBe(1)
      expect(result.unchanged.valid).toBe(0)
      expect(result.adjusted.valid).toBe(0)
    })

    it('handles undefined existingWasteRecords gracefully', () => {
      const result = classifyLoads({
        parsed,
        issues: [],
        existingWasteRecords: undefined
      })

      // All rows should be classified as new since there are no existing records
      expect(result.new.valid).toBe(1)
      expect(result.unchanged.valid).toBe(0)
      expect(result.adjusted.valid).toBe(0)
    })
  })

  describe('edge cases in row processing', () => {
    it('handles headers with falsy values', () => {
      const parsed = {
        meta: {},
        data: {
          UPDATE_WASTE_BALANCE: {
            location: { sheet: 'Received', row: 7, column: 'B' },
            // Headers array has empty string and null values
            headers: ['OUR_REFERENCE', '', null, 'DATE_RECEIVED'],
            rows: [['10001', 'ignored1', 'ignored2', '2025-05-28']]
          }
        }
      }

      const result = classifyLoads({
        parsed,
        issues: [],
        existingWasteRecords: []
      })

      // Should still process row correctly, ignoring falsy headers
      expect(result.new.valid).toBe(1)
    })
  })
})

describe('getRowId', () => {
  it('returns row ID for known table with ID field', () => {
    const rowObject = { OUR_REFERENCE: '12345', OTHER_FIELD: 'value' }
    const result = getRowId(rowObject, 'UPDATE_WASTE_BALANCE')
    expect(result).toBe('12345')
  })

  it('returns null for unknown table without ID field mapping', () => {
    const rowObject = { SOME_FIELD: '12345' }
    const result = getRowId(rowObject, 'UNKNOWN_TABLE')
    expect(result).toBeNull()
  })

  it('returns null when ID field value is null', () => {
    const rowObject = { OUR_REFERENCE: null }
    const result = getRowId(rowObject, 'UPDATE_WASTE_BALANCE')
    expect(result).toBeNull()
  })

  it('returns null when ID field value is undefined', () => {
    const rowObject = { OUR_REFERENCE: undefined }
    const result = getRowId(rowObject, 'UPDATE_WASTE_BALANCE')
    expect(result).toBeNull()
  })

  it('converts numeric ID to string', () => {
    const rowObject = { OUR_REFERENCE: 12345 }
    const result = getRowId(rowObject, 'UPDATE_WASTE_BALANCE')
    expect(result).toBe('12345')
  })
})
