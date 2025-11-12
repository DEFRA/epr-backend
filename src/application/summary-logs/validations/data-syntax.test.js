import { validateDataSyntax } from './data-syntax.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_SEVERITY
} from '#common/validation/validation-issues.js'

describe('validateDataSyntax', () => {
  const createValidUpdateWasteBalanceTable = () => ({
    location: {
      sheet: 'Received (sections 1, 2, 3)',
      row: 7,
      column: 'B'
    },
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
        true,
        'WEIGHT',
        50,
        0.85,
        850
      ],
      [
        10001,
        '2025-08-01T00:00:00.000Z',
        '16 03 10',
        2000,
        200,
        100,
        1700,
        false,
        'VISUAL',
        100,
        0.9,
        1700
      ],
      [
        10002,
        '2025-09-05T00:00:00.000Z',
        '11 03 10',
        1500,
        150,
        75,
        1275,
        true,
        'SAMPLE',
        75,
        0.8,
        1275
      ]
    ]
  })

  describe('UPDATE_WASTE_BALANCE table', () => {
    it('returns valid result when all data is correct', () => {
      const parsed = {
        data: {
          UPDATE_WASTE_BALANCE: createValidUpdateWasteBalanceTable()
        }
      }

      const result = validateDataSyntax({ parsed })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
      expect(result.hasIssues()).toBe(false)
    })

    it('allows headers in different order', () => {
      const parsed = {
        data: {
          UPDATE_WASTE_BALANCE: {
            ...createValidUpdateWasteBalanceTable(),
            headers: [
              'DATE_RECEIVED',
              'OUR_REFERENCE',
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
                '2025-05-28T00:00:00.000Z',
                10000,
                '03 03 08',
                1000,
                100,
                50,
                850,
                true,
                'WEIGHT',
                50,
                0.85,
                850
              ],
              [
                '2025-08-01T00:00:00.000Z',
                10001,
                '16 03 10',
                2000,
                200,
                100,
                1700,
                false,
                'VISUAL',
                100,
                0.9,
                1700
              ]
            ]
          }
        }
      }

      const result = validateDataSyntax({ parsed })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })

    it('allows additional headers beyond required ones', () => {
      const parsed = {
        data: {
          UPDATE_WASTE_BALANCE: {
            ...createValidUpdateWasteBalanceTable(),
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
              'TONNAGE_RECEIVED_FOR_EXPORT',
              'EXTRA_FIELD',
              'ANOTHER_FIELD'
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
                true,
                'WEIGHT',
                50,
                0.85,
                850,
                'extra',
                'data'
              ]
            ]
          }
        }
      }

      const result = validateDataSyntax({ parsed })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })

    it('ignores null headers', () => {
      const parsed = {
        data: {
          UPDATE_WASTE_BALANCE: {
            ...createValidUpdateWasteBalanceTable(),
            headers: [
              'OUR_REFERENCE',
              null,
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
              'TONNAGE_RECEIVED_FOR_EXPORT',
              null
            ],
            rows: [
              [
                10000,
                'ignored',
                '2025-05-28T00:00:00.000Z',
                '03 03 08',
                1000,
                100,
                50,
                850,
                true,
                'WEIGHT',
                50,
                0.85,
                850,
                null
              ]
            ]
          }
        }
      }

      const result = validateDataSyntax({ parsed })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })

    it('ignores special marker headers starting with __', () => {
      const parsed = {
        data: {
          UPDATE_WASTE_BALANCE: {
            ...createValidUpdateWasteBalanceTable(),
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
              'TONNAGE_RECEIVED_FOR_EXPORT',
              '__EPR_DATA_MARKER'
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
                true,
                'WEIGHT',
                50,
                0.85,
                850,
                'marker'
              ]
            ]
          }
        }
      }

      const result = validateDataSyntax({ parsed })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })

    describe('header validation errors', () => {
      it('returns fatal error when required header is missing', () => {
        const parsed = {
          data: {
            UPDATE_WASTE_BALANCE: {
              ...createValidUpdateWasteBalanceTable(),
              headers: ['OUR_REFERENCE', 'DATE_RECEIVED'],
              rows: [[10000, '2025-05-28T00:00:00.000Z']]
            }
          }
        }

        const result = validateDataSyntax({ parsed })

        expect(result.isValid()).toBe(false)
        expect(result.isFatal()).toBe(true)

        const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
        expect(fatals.length).toBeGreaterThanOrEqual(1)
        expect(fatals[0].category).toBe(VALIDATION_CATEGORY.TECHNICAL)
        expect(fatals[0].message).toContain('Missing required header')

        // Check that at least some of the missing headers are reported
        const messages = fatals.map((f) => f.message).join(' ')
        expect(messages).toContain('EWC_CODE')
      })

      it('returns multiple fatal errors when multiple headers are missing', () => {
        const parsed = {
          data: {
            UPDATE_WASTE_BALANCE: {
              ...createValidUpdateWasteBalanceTable(),
              headers: ['OUR_REFERENCE'],
              rows: [[10000]]
            }
          }
        }

        const result = validateDataSyntax({ parsed })

        expect(result.isValid()).toBe(false)
        expect(result.isFatal()).toBe(true)

        const fatals = result.getIssuesBySeverity(VALIDATION_SEVERITY.FATAL)
        expect(fatals.length).toBeGreaterThanOrEqual(2)
        const messages = fatals.map((f) => f.message).join(' ')
        expect(messages).toContain('DATE_RECEIVED')
        expect(messages).toContain('EWC_CODE')
      })
    })

    describe('cell validation errors - OUR_REFERENCE', () => {
      it('returns error (not fatal) when OUR_REFERENCE is not a number', () => {
        const parsed = {
          data: {
            UPDATE_WASTE_BALANCE: {
              ...createValidUpdateWasteBalanceTable(),
              rows: [
                [
                  'not-a-number',
                  '2025-05-28T00:00:00.000Z',
                  '03 03 08',
                  1000,
                  100,
                  50,
                  850,
                  true,
                  'WEIGHT',
                  50,
                  0.85,
                  850
                ]
              ]
            }
          }
        }

        const result = validateDataSyntax({ parsed })

        expect(result.isValid()).toBe(false)
        expect(result.isFatal()).toBe(false) // Cell errors are not fatal

        const errors = result.getIssuesBySeverity(VALIDATION_SEVERITY.ERROR)
        expect(errors).toHaveLength(1)
        expect(errors[0].category).toBe(VALIDATION_CATEGORY.TECHNICAL)
        expect(errors[0].message).toContain('OUR_REFERENCE')
        expect(errors[0].message).toContain('must be a number')
        expect(errors[0].context.row).toBe(1)
        expect(errors[0].context.actual).toBe('not-a-number')
      })

      it('returns error when OUR_REFERENCE is below minimum', () => {
        const parsed = {
          data: {
            UPDATE_WASTE_BALANCE: {
              ...createValidUpdateWasteBalanceTable(),
              rows: [
                [
                  9999,
                  '2025-05-28T00:00:00.000Z',
                  '03 03 08',
                  1000,
                  100,
                  50,
                  850,
                  true,
                  'WEIGHT',
                  50,
                  0.85,
                  850
                ]
              ]
            }
          }
        }

        const result = validateDataSyntax({ parsed })

        expect(result.isValid()).toBe(false)
        expect(result.isFatal()).toBe(false) // Cell errors are not fatal

        const errors = result.getIssuesBySeverity(VALIDATION_SEVERITY.ERROR)
        expect(errors).toHaveLength(1)
        expect(errors[0].message).toContain('OUR_REFERENCE')
        expect(errors[0].message).toContain('must be at least 10000')
      })
    })

    describe('cell validation errors - DATE_RECEIVED', () => {
      it('returns error when DATE_RECEIVED is invalid', () => {
        const parsed = {
          data: {
            UPDATE_WASTE_BALANCE: {
              ...createValidUpdateWasteBalanceTable(),
              rows: [
                [
                  10000,
                  'not-a-date',
                  '03 03 08',
                  1000,
                  100,
                  50,
                  850,
                  true,
                  'WEIGHT',
                  50,
                  0.85,
                  850
                ]
              ]
            }
          }
        }

        const result = validateDataSyntax({ parsed })

        expect(result.isValid()).toBe(false)
        expect(result.isFatal()).toBe(false) // Cell errors are not fatal

        const errors = result.getIssuesBySeverity(VALIDATION_SEVERITY.ERROR)
        expect(errors).toHaveLength(1)
        expect(errors[0].message).toContain('DATE_RECEIVED')
        expect(errors[0].message).toContain('must be a valid date')
      })
    })

    describe('cell validation errors - EWC_CODE', () => {
      it('returns error when EWC_CODE format is invalid', () => {
        const parsed = {
          data: {
            UPDATE_WASTE_BALANCE: {
              ...createValidUpdateWasteBalanceTable(),
              rows: [
                [
                  10000,
                  '2025-05-28T00:00:00.000Z',
                  'invalid',
                  1000,
                  100,
                  50,
                  850,
                  true,
                  'WEIGHT',
                  50,
                  0.85,
                  850
                ]
              ]
            }
          }
        }

        const result = validateDataSyntax({ parsed })

        expect(result.isValid()).toBe(false)
        expect(result.isFatal()).toBe(false) // Cell errors are not fatal

        const errors = result.getIssuesBySeverity(VALIDATION_SEVERITY.ERROR)
        expect(errors).toHaveLength(1)
        expect(errors[0].message).toContain('EWC_CODE')
        expect(errors[0].message).toContain('must be in format "XX XX XX"')
      })

      it('returns error when EWC_CODE is "Choose option" placeholder', () => {
        const parsed = {
          data: {
            UPDATE_WASTE_BALANCE: {
              ...createValidUpdateWasteBalanceTable(),
              rows: [
                [
                  10000,
                  '2025-05-28T00:00:00.000Z',
                  'Choose option',
                  1000,
                  100,
                  50,
                  850,
                  true,
                  'WEIGHT',
                  50,
                  0.85,
                  850
                ]
              ]
            }
          }
        }

        const result = validateDataSyntax({ parsed })

        expect(result.isValid()).toBe(false)
        expect(result.isFatal()).toBe(false) // Cell errors are not fatal
      })
    })

    describe('multiple row errors', () => {
      it('reports errors for multiple rows', () => {
        const parsed = {
          data: {
            UPDATE_WASTE_BALANCE: {
              ...createValidUpdateWasteBalanceTable(),
              rows: [
                [
                  10000,
                  '2025-05-28T00:00:00.000Z',
                  '03 03 08',
                  1000,
                  100,
                  50,
                  850,
                  true,
                  'WEIGHT',
                  50,
                  0.85,
                  850
                ], // Valid
                [
                  9999,
                  'invalid-date',
                  'bad-code',
                  1000,
                  100,
                  50,
                  850,
                  true,
                  'WEIGHT',
                  50,
                  0.85,
                  850
                ], // Row 2: 3 errors
                [
                  10001,
                  '2025-08-01T00:00:00.000Z',
                  '16 03 10',
                  2000,
                  200,
                  100,
                  1700,
                  false,
                  'VISUAL',
                  100,
                  0.9,
                  1700
                ] // Valid
              ]
            }
          }
        }

        const result = validateDataSyntax({ parsed })

        expect(result.isValid()).toBe(false)
        expect(result.isFatal()).toBe(false) // Cell errors are not fatal

        const errors = result.getIssuesBySeverity(VALIDATION_SEVERITY.ERROR)
        expect(errors.length).toBe(3) // All 3 errors from row 2
        expect(errors.every((e) => e.context.row === 2)).toBe(true)
      })
    })

    describe('location context', () => {
      it('includes spreadsheet location in error context', () => {
        const parsed = {
          data: {
            UPDATE_WASTE_BALANCE: {
              location: {
                sheet: 'Received (sections 1, 2, 3)',
                row: 7,
                column: 'B'
              },
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
                  9999,
                  '2025-05-28T00:00:00.000Z',
                  '03 03 08',
                  1000,
                  100,
                  50,
                  850,
                  true,
                  'WEIGHT',
                  50,
                  0.85,
                  850
                ]
              ]
            }
          }
        }

        const result = validateDataSyntax({ parsed })

        const errors = result.getIssuesBySeverity(VALIDATION_SEVERITY.ERROR)
        expect(errors[0].context.location).toBeDefined()
        expect(errors[0].context.location.sheet).toBe(
          'Received (sections 1, 2, 3)'
        )
        expect(errors[0].context.location.row).toBe(8) // 7 + 1 (for data row)
        expect(errors[0].context.location.column).toBe('B') // Column B for OUR_REFERENCE
      })

      it('calculates correct column letters for multiple errors', () => {
        const parsed = {
          data: {
            UPDATE_WASTE_BALANCE: {
              location: {
                sheet: 'Sheet1',
                row: 10,
                column: 'B'
              },
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
                  9999,
                  'invalid-date',
                  'bad-code',
                  1000,
                  100,
                  50,
                  850,
                  true,
                  'WEIGHT',
                  50,
                  0.85,
                  850
                ]
              ] // First 3 fields invalid
            }
          }
        }

        const result = validateDataSyntax({ parsed })
        const errors = result.getIssuesBySeverity(VALIDATION_SEVERITY.ERROR)

        expect(errors).toHaveLength(3)

        // Find errors by field to check their columns
        const refError = errors.find((e) => e.context.field === 'OUR_REFERENCE')
        const dateError = errors.find(
          (e) => e.context.field === 'DATE_RECEIVED'
        )
        const ewcError = errors.find((e) => e.context.field === 'EWC_CODE')

        expect(refError.context.location.column).toBe('B') // First column
        expect(dateError.context.location.column).toBe('C') // Second column
        expect(ewcError.context.location.column).toBe('D') // Third column
      })

      it('handles multi-letter column offsets correctly', () => {
        const parsed = {
          data: {
            UPDATE_WASTE_BALANCE: {
              location: {
                sheet: 'Sheet1',
                row: 5,
                column: 'Z' // Start at column Z
              },
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
                  9999,
                  'invalid',
                  'bad',
                  1000,
                  100,
                  50,
                  850,
                  true,
                  'WEIGHT',
                  50,
                  0.85,
                  850
                ]
              ]
            }
          }
        }

        const result = validateDataSyntax({ parsed })
        const errors = result.getIssuesBySeverity(VALIDATION_SEVERITY.ERROR)

        const refError = errors.find((e) => e.context.field === 'OUR_REFERENCE')
        const dateError = errors.find(
          (e) => e.context.field === 'DATE_RECEIVED'
        )
        const ewcError = errors.find((e) => e.context.field === 'EWC_CODE')

        expect(refError.context.location.column).toBe('Z') // Column 26
        expect(dateError.context.location.column).toBe('AA') // Column 27
        expect(ewcError.context.location.column).toBe('AB') // Column 28
      })

      it('handles missing location gracefully', () => {
        const parsed = {
          data: {
            UPDATE_WASTE_BALANCE: {
              // No location provided
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
                  9999,
                  '2025-05-28T00:00:00.000Z',
                  '03 03 08',
                  1000,
                  100,
                  50,
                  850,
                  true,
                  'WEIGHT',
                  50,
                  0.85,
                  850
                ]
              ]
            }
          }
        }

        const result = validateDataSyntax({ parsed })
        const errors = result.getIssuesBySeverity(VALIDATION_SEVERITY.ERROR)

        expect(errors[0].context.location).toBeUndefined()
      })
    })

    describe('cell validation errors - GROSS_WEIGHT', () => {
      it('returns error when GROSS_WEIGHT is not a number', () => {
        const parsed = {
          data: {
            UPDATE_WASTE_BALANCE: {
              ...createValidUpdateWasteBalanceTable(),
              rows: [
                [
                  10000,
                  '2025-05-28T00:00:00.000Z',
                  '03 03 08',
                  'not-a-number',
                  100,
                  50,
                  850,
                  true,
                  'WEIGHT',
                  50,
                  0.85,
                  850
                ]
              ]
            }
          }
        }

        const result = validateDataSyntax({ parsed })
        expect(result.isValid()).toBe(false)
        expect(result.isFatal()).toBe(false)

        const errors = result.getIssuesBySeverity(VALIDATION_SEVERITY.ERROR)
        expect(errors).toHaveLength(1)
        expect(errors[0].message).toContain('GROSS_WEIGHT')
        expect(errors[0].message).toContain('must be a number')
      })

      it('returns error when GROSS_WEIGHT is zero or negative', () => {
        const parsed = {
          data: {
            UPDATE_WASTE_BALANCE: {
              ...createValidUpdateWasteBalanceTable(),
              rows: [
                [
                  10000,
                  '2025-05-28T00:00:00.000Z',
                  '03 03 08',
                  0,
                  100,
                  50,
                  850,
                  true,
                  'WEIGHT',
                  50,
                  0.85,
                  850
                ]
              ]
            }
          }
        }

        const result = validateDataSyntax({ parsed })
        expect(result.isValid()).toBe(false)

        const errors = result.getIssuesBySeverity(VALIDATION_SEVERITY.ERROR)
        expect(errors[0].message).toContain('GROSS_WEIGHT')
        expect(errors[0].message).toContain('must be greater than 0')
      })
    })

    describe('cell validation errors - BAILING_WIRE', () => {
      it('returns error when BAILING_WIRE is not a boolean', () => {
        const parsed = {
          data: {
            UPDATE_WASTE_BALANCE: {
              ...createValidUpdateWasteBalanceTable(),
              rows: [
                [
                  10000,
                  '2025-05-28T00:00:00.000Z',
                  '03 03 08',
                  1000,
                  100,
                  50,
                  850,
                  'yes',
                  'WEIGHT',
                  50,
                  0.85,
                  850
                ]
              ]
            }
          }
        }

        const result = validateDataSyntax({ parsed })
        expect(result.isValid()).toBe(false)

        const errors = result.getIssuesBySeverity(VALIDATION_SEVERITY.ERROR)
        expect(errors).toHaveLength(1)
        expect(errors[0].message).toContain('BAILING_WIRE')
        expect(errors[0].message).toContain('must be a boolean')
      })
    })

    describe('cell validation errors - HOW_CALCULATE_RECYCLABLE', () => {
      it('returns error when HOW_CALCULATE_RECYCLABLE contains lowercase letters', () => {
        const parsed = {
          data: {
            UPDATE_WASTE_BALANCE: {
              ...createValidUpdateWasteBalanceTable(),
              rows: [
                [
                  10000,
                  '2025-05-28T00:00:00.000Z',
                  '03 03 08',
                  1000,
                  100,
                  50,
                  850,
                  true,
                  'weight',
                  50,
                  0.85,
                  850
                ]
              ]
            }
          }
        }

        const result = validateDataSyntax({ parsed })
        expect(result.isValid()).toBe(false)

        const errors = result.getIssuesBySeverity(VALIDATION_SEVERITY.ERROR)
        expect(errors[0].message).toContain('HOW_CALCULATE_RECYCLABLE')
        expect(errors[0].message).toContain(
          'must contain only uppercase letters'
        )
      })

      it('returns error when HOW_CALCULATE_RECYCLABLE contains numbers', () => {
        const parsed = {
          data: {
            UPDATE_WASTE_BALANCE: {
              ...createValidUpdateWasteBalanceTable(),
              rows: [
                [
                  10000,
                  '2025-05-28T00:00:00.000Z',
                  '03 03 08',
                  1000,
                  100,
                  50,
                  850,
                  true,
                  'WEIGHT123',
                  50,
                  0.85,
                  850
                ]
              ]
            }
          }
        }

        const result = validateDataSyntax({ parsed })
        expect(result.isValid()).toBe(false)

        const errors = result.getIssuesBySeverity(VALIDATION_SEVERITY.ERROR)
        expect(errors[0].message).toContain('HOW_CALCULATE_RECYCLABLE')
      })
    })

    describe('cell validation errors - RECYCLABLE_PROPORTION', () => {
      it('returns error when RECYCLABLE_PROPORTION is not a number', () => {
        const parsed = {
          data: {
            UPDATE_WASTE_BALANCE: {
              ...createValidUpdateWasteBalanceTable(),
              rows: [
                [
                  10000,
                  '2025-05-28T00:00:00.000Z',
                  '03 03 08',
                  1000,
                  100,
                  50,
                  850,
                  true,
                  'WEIGHT',
                  50,
                  'invalid',
                  850
                ]
              ]
            }
          }
        }

        const result = validateDataSyntax({ parsed })
        expect(result.isValid()).toBe(false)

        const errors = result.getIssuesBySeverity(VALIDATION_SEVERITY.ERROR)
        expect(errors[0].message).toContain('RECYCLABLE_PROPORTION')
        expect(errors[0].message).toContain('must be a number')
      })

      it('returns error when RECYCLABLE_PROPORTION is zero or negative', () => {
        const parsed = {
          data: {
            UPDATE_WASTE_BALANCE: {
              ...createValidUpdateWasteBalanceTable(),
              rows: [
                [
                  10000,
                  '2025-05-28T00:00:00.000Z',
                  '03 03 08',
                  1000,
                  100,
                  50,
                  850,
                  true,
                  'WEIGHT',
                  50,
                  0,
                  850
                ]
              ]
            }
          }
        }

        const result = validateDataSyntax({ parsed })
        expect(result.isValid()).toBe(false)

        const errors = result.getIssuesBySeverity(VALIDATION_SEVERITY.ERROR)
        expect(errors[0].message).toContain('RECYCLABLE_PROPORTION')
        expect(errors[0].message).toContain('must be greater than 0')
      })

      it('returns error when RECYCLABLE_PROPORTION is 1 or greater', () => {
        const parsed = {
          data: {
            UPDATE_WASTE_BALANCE: {
              ...createValidUpdateWasteBalanceTable(),
              rows: [
                [
                  10000,
                  '2025-05-28T00:00:00.000Z',
                  '03 03 08',
                  1000,
                  100,
                  50,
                  850,
                  true,
                  'WEIGHT',
                  50,
                  1.0,
                  850
                ]
              ]
            }
          }
        }

        const result = validateDataSyntax({ parsed })
        expect(result.isValid()).toBe(false)

        const errors = result.getIssuesBySeverity(VALIDATION_SEVERITY.ERROR)
        expect(errors[0].message).toContain('RECYCLABLE_PROPORTION')
        expect(errors[0].message).toContain('must be less than 1')
      })
    })

    describe('cell validation errors - TONNAGE_RECEIVED_FOR_EXPORT', () => {
      it('returns error when TONNAGE_RECEIVED_FOR_EXPORT is not a number', () => {
        const parsed = {
          data: {
            UPDATE_WASTE_BALANCE: {
              ...createValidUpdateWasteBalanceTable(),
              rows: [
                [
                  10000,
                  '2025-05-28T00:00:00.000Z',
                  '03 03 08',
                  1000,
                  100,
                  50,
                  850,
                  true,
                  'WEIGHT',
                  50,
                  0.85,
                  'not-a-number'
                ]
              ]
            }
          }
        }

        const result = validateDataSyntax({ parsed })
        expect(result.isValid()).toBe(false)

        const errors = result.getIssuesBySeverity(VALIDATION_SEVERITY.ERROR)
        expect(errors[0].message).toContain('TONNAGE_RECEIVED_FOR_EXPORT')
        expect(errors[0].message).toContain('must be a number')
      })
    })
  })

  describe('multiple tables', () => {
    it('validates multiple tables independently', () => {
      const parsed = {
        data: {
          UPDATE_WASTE_BALANCE: createValidUpdateWasteBalanceTable(),
          UNKNOWN_TABLE: {
            // This should be ignored since no schema exists
            headers: ['ANYTHING'],
            rows: [['goes']]
          }
        }
      }

      const result = validateDataSyntax({ parsed })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('handles missing data section gracefully', () => {
      const parsed = {}

      const result = validateDataSyntax({ parsed })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })

    it('handles empty data section gracefully', () => {
      const parsed = { data: {} }

      const result = validateDataSyntax({ parsed })

      expect(result.isValid()).toBe(true)
      expect(result.isFatal()).toBe(false)
    })
  })
})
