import { NATION, WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import {
  AGENCY_CODE,
  ISSUER_TYPE_CODE,
  calculateCheckCharacter,
  generatePrnNumber,
  validatePrnNumber,
  parsePrnNumber,
  PRN_NUMBER_PATTERN
} from './number-format.js'

describe('PRN number format', () => {
  describe('AGENCY_CODE', () => {
    it('maps all nations to single-character codes', () => {
      expect(AGENCY_CODE[NATION.ENGLAND]).toBe('E')
      expect(AGENCY_CODE[NATION.NORTHERN_IRELAND]).toBe('N')
      expect(AGENCY_CODE[NATION.SCOTLAND]).toBe('S')
      expect(AGENCY_CODE[NATION.WALES]).toBe('W')
    })
  })

  describe('ISSUER_TYPE_CODE', () => {
    it('maps waste processing types to single-character codes', () => {
      expect(ISSUER_TYPE_CODE[WASTE_PROCESSING_TYPE.REPROCESSOR]).toBe('R')
      expect(ISSUER_TYPE_CODE[WASTE_PROCESSING_TYPE.EXPORTER]).toBe('X')
    })
  })

  describe('calculateCheckCharacter', () => {
    it('returns a single uppercase letter', () => {
      const result = calculateCheckCharacter('E', 'R', 26, 1)
      expect(result).toMatch(/^[A-Z]$/)
    })

    it('produces consistent results for the same input', () => {
      const result1 = calculateCheckCharacter('E', 'R', 26, 25468)
      const result2 = calculateCheckCharacter('E', 'R', 26, 25468)
      expect(result1).toBe(result2)
    })

    it('produces different results for different sequence numbers', () => {
      const result1 = calculateCheckCharacter('E', 'R', 26, 1)
      const result2 = calculateCheckCharacter('E', 'R', 26, 2)
      expect(result1).not.toBe(result2)
    })

    it('produces different results for different nations', () => {
      const resultEngland = calculateCheckCharacter('E', 'R', 26, 1)
      const resultScotland = calculateCheckCharacter('S', 'R', 26, 1)
      expect(resultEngland).not.toBe(resultScotland)
    })

    it('produces different results for different issuer types', () => {
      const resultReprocessor = calculateCheckCharacter('E', 'R', 26, 1)
      const resultExporter = calculateCheckCharacter('E', 'X', 26, 1)
      expect(resultReprocessor).not.toBe(resultExporter)
    })

    it('handles single-digit years with padding', () => {
      const result = calculateCheckCharacter('E', 'R', 6, 1)
      expect(result).toMatch(/^[A-Z]$/)
    })

    it('handles single-digit sequence numbers with padding', () => {
      const result = calculateCheckCharacter('E', 'R', 26, 1)
      expect(result).toMatch(/^[A-Z]$/)
    })
  })

  describe('generatePrnNumber', () => {
    it('generates a 10-character PRN number', () => {
      const result = generatePrnNumber({
        nation: NATION.ENGLAND,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        year: 2026,
        sequenceNumber: 25468
      })
      expect(result).toHaveLength(10)
    })

    it('generates PRN in correct format', () => {
      const result = generatePrnNumber({
        nation: NATION.ENGLAND,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        year: 2026,
        sequenceNumber: 25468
      })
      expect(result).toMatch(PRN_NUMBER_PATTERN)
      expect(result.slice(0, 2)).toBe('ER')
      expect(result.slice(2, 4)).toBe('26')
      expect(result.slice(4, 9)).toBe('25468')
    })

    it('generates PRN for exporter', () => {
      const result = generatePrnNumber({
        nation: NATION.ENGLAND,
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
        year: 2026,
        sequenceNumber: 1
      })
      expect(result).toMatch(/^EX26/)
    })

    it('generates PRN for Scotland', () => {
      const result = generatePrnNumber({
        nation: NATION.SCOTLAND,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        year: 2026,
        sequenceNumber: 1
      })
      expect(result).toMatch(/^SR26/)
    })

    it('generates PRN for Wales', () => {
      const result = generatePrnNumber({
        nation: NATION.WALES,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        year: 2026,
        sequenceNumber: 1
      })
      expect(result).toMatch(/^WR26/)
    })

    it('generates PRN for Northern Ireland', () => {
      const result = generatePrnNumber({
        nation: NATION.NORTHERN_IRELAND,
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
        year: 2026,
        sequenceNumber: 1
      })
      expect(result).toMatch(/^NX26/)
    })

    it('pads sequence number to 5 digits', () => {
      const result = generatePrnNumber({
        nation: NATION.ENGLAND,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        year: 2026,
        sequenceNumber: 1
      })
      expect(result.slice(4, 9)).toBe('00001')
    })

    it('handles two-digit year input', () => {
      const result = generatePrnNumber({
        nation: NATION.ENGLAND,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        year: 26,
        sequenceNumber: 1
      })
      expect(result.slice(2, 4)).toBe('26')
    })

    it('handles maximum sequence number', () => {
      const result = generatePrnNumber({
        nation: NATION.ENGLAND,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        year: 2026,
        sequenceNumber: 99999
      })
      expect(result.slice(4, 9)).toBe('99999')
    })

    it('throws error for invalid nation', () => {
      expect(() =>
        generatePrnNumber({
          nation: 'invalid',
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          year: 2026,
          sequenceNumber: 1
        })
      ).toThrow('Invalid nation: invalid')
    })

    it('throws error for invalid waste processing type', () => {
      expect(() =>
        generatePrnNumber({
          nation: NATION.ENGLAND,
          wasteProcessingType: 'invalid',
          year: 2026,
          sequenceNumber: 1
        })
      ).toThrow('Invalid waste processing type: invalid')
    })

    it('throws error for sequence number less than 1', () => {
      expect(() =>
        generatePrnNumber({
          nation: NATION.ENGLAND,
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          year: 2026,
          sequenceNumber: 0
        })
      ).toThrow('Sequence number must be between 1 and 99999')
    })

    it('throws error for sequence number greater than 99999', () => {
      expect(() =>
        generatePrnNumber({
          nation: NATION.ENGLAND,
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          year: 2026,
          sequenceNumber: 100000
        })
      ).toThrow('Sequence number must be between 1 and 99999')
    })
  })

  describe('validatePrnNumber', () => {
    it('returns valid for correctly formatted PRN', () => {
      const prn = generatePrnNumber({
        nation: NATION.ENGLAND,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        year: 2026,
        sequenceNumber: 25468
      })
      const result = validatePrnNumber(prn)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('returns error for null input', () => {
      const result = validatePrnNumber(null)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('PRN number is required')
    })

    it('returns error for undefined input', () => {
      const result = validatePrnNumber(undefined)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('PRN number is required')
    })

    it('returns error for non-string input', () => {
      const result = validatePrnNumber(12345)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('PRN number is required')
    })

    it('returns error for invalid format - too short', () => {
      const result = validatePrnNumber('ER2625468')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('must match format')
    })

    it('returns error for invalid format - too long', () => {
      const result = validatePrnNumber('ER2625468UU')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('must match format')
    })

    it('returns error for invalid agency code', () => {
      const result = validatePrnNumber('ZR2625468U')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('must match format')
    })

    it('returns error for invalid issuer type', () => {
      const result = validatePrnNumber('EZ2625468U')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('must match format')
    })

    it('returns error for lowercase input', () => {
      const result = validatePrnNumber('er2625468u')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('must match format')
    })

    it('returns error for invalid check character', () => {
      // Generate valid PRN and change check character
      const validPrn = generatePrnNumber({
        nation: NATION.ENGLAND,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        year: 2026,
        sequenceNumber: 25468
      })
      const invalidPrn = validPrn.slice(0, 9) + 'Z' // Force different check char

      // Only test if the forced character is actually different
      if (validPrn[9] !== 'Z') {
        const result = validatePrnNumber(invalidPrn)
        expect(result.valid).toBe(false)
        expect(result.error).toContain('Invalid check character')
      }
    })

    it('validates PRNs from all nations', () => {
      const nations = [
        NATION.ENGLAND,
        NATION.SCOTLAND,
        NATION.WALES,
        NATION.NORTHERN_IRELAND
      ]

      for (const nation of nations) {
        const prn = generatePrnNumber({
          nation,
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          year: 2026,
          sequenceNumber: 1
        })
        const result = validatePrnNumber(prn)
        expect(result.valid).toBe(true)
      }
    })

    it('validates PRNs for both issuer types', () => {
      const types = [
        WASTE_PROCESSING_TYPE.REPROCESSOR,
        WASTE_PROCESSING_TYPE.EXPORTER
      ]

      for (const wasteProcessingType of types) {
        const prn = generatePrnNumber({
          nation: NATION.ENGLAND,
          wasteProcessingType,
          year: 2026,
          sequenceNumber: 1
        })
        const result = validatePrnNumber(prn)
        expect(result.valid).toBe(true)
      }
    })
  })

  describe('parsePrnNumber', () => {
    it('parses valid PRN number into components', () => {
      const prn = generatePrnNumber({
        nation: NATION.ENGLAND,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        year: 2026,
        sequenceNumber: 25468
      })

      const result = parsePrnNumber(prn)

      expect(result).toEqual({
        agencyCode: 'E',
        issuerTypeCode: 'R',
        year: 26,
        sequenceNumber: 25468,
        checkCharacter: prn[9]
      })
    })

    it('returns null for invalid format', () => {
      const result = parsePrnNumber('invalid')
      expect(result).toBeNull()
    })

    it('returns null for empty string', () => {
      const result = parsePrnNumber('')
      expect(result).toBeNull()
    })

    it('parses sequence numbers with leading zeros', () => {
      const prn = generatePrnNumber({
        nation: NATION.ENGLAND,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        year: 2026,
        sequenceNumber: 1
      })

      const result = parsePrnNumber(prn)

      expect(result.sequenceNumber).toBe(1)
    })

    it('parses all agency codes', () => {
      const testCases = [
        { nation: NATION.ENGLAND, expectedCode: 'E' },
        { nation: NATION.SCOTLAND, expectedCode: 'S' },
        { nation: NATION.WALES, expectedCode: 'W' },
        { nation: NATION.NORTHERN_IRELAND, expectedCode: 'N' }
      ]

      for (const { nation, expectedCode } of testCases) {
        const prn = generatePrnNumber({
          nation,
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          year: 2026,
          sequenceNumber: 1
        })

        const result = parsePrnNumber(prn)
        expect(result.agencyCode).toBe(expectedCode)
      }
    })

    it('parses both issuer type codes', () => {
      const testCases = [
        {
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          expectedCode: 'R'
        },
        {
          wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
          expectedCode: 'X'
        }
      ]

      for (const { wasteProcessingType, expectedCode } of testCases) {
        const prn = generatePrnNumber({
          nation: NATION.ENGLAND,
          wasteProcessingType,
          year: 2026,
          sequenceNumber: 1
        })

        const result = parsePrnNumber(prn)
        expect(result.issuerTypeCode).toBe(expectedCode)
      }
    })
  })

  describe('PRN_NUMBER_PATTERN', () => {
    it('matches valid PRN format', () => {
      expect('ER2625468U').toMatch(PRN_NUMBER_PATTERN)
      expect('NX2500001A').toMatch(PRN_NUMBER_PATTERN)
      expect('SR9999999Z').toMatch(PRN_NUMBER_PATTERN)
      expect('WR0000001A').toMatch(PRN_NUMBER_PATTERN)
    })

    it('rejects invalid formats', () => {
      expect('ZR2625468U').not.toMatch(PRN_NUMBER_PATTERN) // Invalid agency
      expect('EZ2625468U').not.toMatch(PRN_NUMBER_PATTERN) // Invalid issuer type
      expect('ER262546U').not.toMatch(PRN_NUMBER_PATTERN) // Too few digits
      expect('ER26254680U').not.toMatch(PRN_NUMBER_PATTERN) // Too many digits
      expect('ER26254681').not.toMatch(PRN_NUMBER_PATTERN) // Missing check char
      expect('er2625468u').not.toMatch(PRN_NUMBER_PATTERN) // Lowercase
    })
  })
})
